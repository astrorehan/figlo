"""Package only tracked sources and explicit plugin build artifacts; no private exports."""
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
version = sys.argv[1]
if not all(c.isalnum() or c in '.-' for c in version):
    raise SystemExit('Invalid release version')
out = root / 'build' / 'release' / version
out.mkdir(parents=True, exist_ok=True)
if subprocess.check_output(['git', 'status', '--porcelain'], cwd=root).strip():
    raise SystemExit('Commit release changes before packaging; the source tree must be clean')
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip()
files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
files = [f for f in files if f and (root / f).is_file()]
required = ['studio/src/Crisp.luau', 'studio/src/ImageKey.luau', 'studio/src/Protocol.luau', 'LICENSE', 'package.json']
if any(f not in files for f in required):
    raise SystemExit('Release sources are untracked; add all release files to Git first')
if any(f.startswith(('.bak/', 'out/', 'build/', 'relay/.sessions/', 'node_modules/')) for f in files):
    raise SystemExit('Private/generated working data must not be tracked')

def archive(path, entries, committed=False):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for source, target in sorted(entries, key=lambda entry: entry[1]):
            info = zipfile.ZipInfo(target, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            data = subprocess.check_output(['git', 'show', f'HEAD:{source.relative_to(root).as_posix()}'], cwd=root) if committed else source.read_bytes()
            z.writestr(info, data)

archive(out / f'Figlo-{version}-source.zip', [(root / f, f'Figlo/{f}') for f in files], committed=True)
with zipfile.ZipFile(out / f'Figlo-{version}-source.zip', 'a', zipfile.ZIP_DEFLATED) as z:
    info = zipfile.ZipInfo('Figlo/REVISION.txt', date_time=(2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    z.writestr(info, revision + '\n')
archive(out / f'Figlo-{version}-figma.zip', [(root / 'figma' / 'plugin' / f, f'Figlo/{f}') for f in ('code.js', 'manifest.json', 'ui.html')] + [(root / 'LICENSE', 'Figlo/LICENSE')])
shutil.copyfile(root / 'build' / 'Figlo.rbxm', out / f'Figlo-{version}-studio.rbxm')
shutil.copyfile(root / 'out' / 'figlo-page.min.js', out / f'Figlo-{version}-web.js')
print('Packaged source, Figma plugin, Studio plugin and optional browser driver')
