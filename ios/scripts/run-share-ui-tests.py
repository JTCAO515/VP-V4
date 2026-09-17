"""Run the real iOS sharing UI against explicit loopback synthetic snapshot inputs.

First build-for-testing with the desired derived-data path and start
node tests/integration/sharing/native-share-fixture.mjs in the repo.
This runner injects no credentials and never discovers a remote environment.
"""
import argparse
import pathlib
import plistlib
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--derived-data", type=pathlib.Path, required=True)
parser.add_argument("--simulator", required=True)
parser.add_argument("--result-bundle", type=pathlib.Path, required=True)
args = parser.parse_args()
products = args.derived_data.resolve() / "Build/Products"
source = next(products.glob("*.xctestrun"))
settings = plistlib.loads(source.read_bytes())

def resolve(value):
    if isinstance(value, str):
        return value.replace("__TESTROOT__", str(products))
    if isinstance(value, list):
        return [resolve(item) for item in value]
    if isinstance(value, dict):
        return {key: resolve(item) for key, item in value.items()}
    return value

settings = resolve(settings)
settings["VisePandaUITests"].setdefault("EnvironmentVariables", {})["VP_NATIVE_SHARE_UI"] = "1"
with tempfile.TemporaryDirectory(prefix="vpj49-ui-") as directory:
    config = pathlib.Path(directory) / "sharing.xctestrun"
    config.write_bytes(plistlib.dumps(settings))
    result = subprocess.run([
        "xcodebuild", "test-without-building", "-xctestrun", str(config),
        "-destination", "platform=iOS Simulator,id=" + args.simulator,
        "-parallel-testing-enabled", "NO",
        "-only-testing:VisePandaUITests/NativeTripShareUITests",
        "-resultBundlePath", str(args.result_bundle.resolve()),
    ])
    raise SystemExit(result.returncode)
