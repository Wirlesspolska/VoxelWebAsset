#!/usr/bin/env python3
"""Serve Voxie (static) over HTTP — interactive launcher for console / .exe.

ES modules / workers need http:// — double-clicking index.html (file://) will not work.

Usage:
  python run.py
  python run.py --port 8090 --no-browser
  VoxieServe.exe
"""

from __future__ import annotations

import argparse
import functools
import http.server
import ipaddress
import re
import socket
import socketserver
import sys
import threading
import time
import webbrowser
from pathlib import Path

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8080
ENTRY_FILES = ("index.html", "voxel-forge.html", "voxel-world.html")
PAGES = {
    "1": ("/", "Hub (index)"),
    "2": ("/voxel-forge.html", "Asset Forge"),
    "3": ("/voxel-world.html", "World Forge"),
}

# Hostname / DNS label: localhost, my-pc, etc. (no spaces, no garbage).
_HOST_NAME_RE = re.compile(
    r"^(?=.{1,253}$)(?!-)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.(?!-)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$"
)


def app_base() -> Path:
    """Directory of this script, or of the frozen .exe."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def is_project_root(directory: Path) -> bool:
    return (directory / "index.html").is_file()


def resolve_serve_root() -> Path | None:
    """Find the folder that contains index.html.

    Prefer the script / exe directory; if missing there, walk a few parents
    and peek one level into nearby sibling/child folders.
    """
    base = app_base()
    candidates: list[Path] = [base]

    # Walk up a few parents (covers running from build/dist subfolders).
    for parent in list(base.parents)[:6]:
        candidates.append(parent)

    # Nearby: children of base and of its immediate parent.
    for anchor in (base, base.parent):
        try:
            if not anchor.is_dir():
                continue
            for child in sorted(anchor.iterdir()):
                if child.is_dir():
                    candidates.append(child)
        except OSError:
            pass

    seen: set[Path] = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        if is_project_root(resolved):
            return resolved
    return None


def describe_missing_root(tried: Path) -> None:
    print(f"error: could not find a Voxie project folder with index.html.", file=sys.stderr)
    print(f"  Started looking from:\n    {tried}", file=sys.stderr)
    print("  Expected entry files in the project root:", file=sys.stderr)
    for name in ENTRY_FILES:
        print(f"    - {name}", file=sys.stderr)
    print(
        "Put VoxieServe.exe (or run.py) in the same folder as index.html.",
        file=sys.stderr,
    )


def list_entry_files(root: Path) -> None:
    print("Entry files:")
    for name in ENTRY_FILES:
        path = root / name
        status = "OK" if path.is_file() else "missing"
        print(f"  [{status}] {name}")


def is_valid_host(host: str) -> bool:
    """Accept IPv4/IPv6 or a simple hostname; reject spaces / nonsense."""
    host = host.strip()
    if not host or any(c.isspace() for c in host):
        return False
    if host in ("*", "localhost"):
        return True
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        pass
    return bool(_HOST_NAME_RE.fullmatch(host))


def port_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


def pick_port(host: str, preferred: int) -> int:
    if port_free(host, preferred):
        return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return int(s.getsockname()[1])


def ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default != "" else ""
    try:
        raw = input(f"{prompt}{suffix}: ").strip()
    except EOFError:
        return default
    return raw if raw else default


def ask_yes_no(prompt: str, default_yes: bool = True) -> bool:
    hint = "Y/n" if default_yes else "y/N"
    raw = ask(f"{prompt} ({hint})", "y" if default_yes else "n").lower()
    if raw in ("y", "yes"):
        return True
    if raw in ("n", "no"):
        return False
    return default_yes


def ask_host(default: str = DEFAULT_HOST) -> str:
    """Prompt for bind address; reject garbage and fall back after retries."""
    attempts = 0
    while True:
        raw = ask("Host (127.0.0.1 = this PC only)", default)
        if is_valid_host(raw):
            return raw.strip()
        attempts += 1
        print(f"  Invalid host {raw!r} — use an IP (127.0.0.1) or hostname (localhost).")
        if attempts >= 3:
            print(f"  Using default {default}.")
            return default


def ask_port(default: int) -> int:
    while True:
        raw = ask("Port", str(default))
        try:
            port = int(raw)
        except ValueError:
            print("  Enter a number (e.g. 8080).")
            continue
        if not (1 <= port <= 65535):
            print("  Port must be 1–65535.")
            continue
        return port


def ask_page() -> str:
    print("\nOpen which page?")
    for key, (_path, label) in PAGES.items():
        print(f"  {key}) {label}")
    choice = ask("Choice", "1")
    if choice in PAGES:
        return PAGES[choice][0]
    if choice.startswith("/"):
        return choice
    # bare filename
    if choice.endswith(".html"):
        return "/" + choice.lstrip("/")
    print("  Unknown choice — using Hub.")
    return "/"


def interactive_config() -> tuple[str, int, str, bool]:
    print("=" * 48)
    print("  VOXIE — local static server")
    print("=" * 48)
    print("Modules / workers need http:// (not file://).\n")

    host = ask_host(DEFAULT_HOST)
    port = ask_port(DEFAULT_PORT)
    path = ask_page()
    open_browser = ask_yes_no("Open browser automatically?", True)
    print()
    return host, port, path, open_browser


def pause_exit(code: int = 0) -> int:
    """Keep the console open when launched by double-click (.exe)."""
    if sys.stdin.isatty():
        try:
            input("\nPress Enter to close…")
        except EOFError:
            pass
    return code


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    interactive = len(argv) == 0

    parser = argparse.ArgumentParser(description="Serve Voxie and open the hub.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--path", default="/")
    parser.add_argument("-i", "--interactive", action="store_true", help="Force prompts")
    args = parser.parse_args(argv)

    base = app_base()
    root = resolve_serve_root()
    if root is None:
        describe_missing_root(base)
        return pause_exit(1)

    if interactive or args.interactive:
        host, port_wanted, path, open_browser = interactive_config()
    else:
        host = args.host
        if not is_valid_host(host):
            print(
                f"error: invalid --host {host!r} (use 127.0.0.1 or localhost).",
                file=sys.stderr,
            )
            return pause_exit(1)
        port_wanted = args.port
        if not (1 <= port_wanted <= 65535):
            print("error: --port must be 1–65535.", file=sys.stderr)
            return pause_exit(1)
        path = args.path if args.path.startswith("/") else "/" + args.path
        open_browser = not args.no_browser

    port = pick_port(host, port_wanted)
    if port != port_wanted:
        print(f"Port {port_wanted} is busy — using {port} instead.")
        if interactive or args.interactive:
            if not ask_yes_no(f"Continue on port {port}?", True):
                return pause_exit(1)

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    socketserver.TCPServer.allow_reuse_address = True

    try:
        httpd = socketserver.TCPServer((host, port), handler)
    except OSError as e:
        print(f"error: could not bind {host}:{port}: {e}", file=sys.stderr)
        return pause_exit(1)

    if not path.startswith("/"):
        path = "/" + path
    url = f"http://{host}:{port}{path}"

    print(f"Serving root: {root}")
    list_entry_files(root)
    print(f"Serving at  {url}")
    print("Also:")
    for name in ENTRY_FILES:
        if (root / name).is_file():
            href = "/" if name == "index.html" else f"/{name}"
            print(f"  http://{host}:{port}{href}")
    print("\nCtrl+C to stop.\n")

    if open_browser:
        def _open() -> None:
            time.sleep(0.35)
            webbrowser.open(url)

        threading.Thread(target=_open, daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()

    return pause_exit(0)


if __name__ == "__main__":
    raise SystemExit(main())
