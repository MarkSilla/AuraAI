const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function patchFile(relativePath, transform) {
  const filePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");
  const patched = transform(source);
  if (patched !== source) {
    fs.writeFileSync(filePath, patched);
  }
}

patchFile(
  "node_modules/onnxruntime-react-native/android/build.gradle",
  (source) =>
    source.replace(
      'if (VersionNumber.parse(REACT_NATIVE_VERSION) < VersionNumber.parse("0.71")) {',
      'if (REACT_NATIVE_MINOR_VERSION < 71) {'
    )
);

patchFile(
  "node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle",
  (source) =>
    source.replace(
      "from components.release",
      'from components.findByName("release")'
    )
);
