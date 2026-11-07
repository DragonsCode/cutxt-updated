export function basenameNoExt(file) {
  if (!file?.name) return "";
  return file.name.replace(/\.[^/.]+$/, "") || file.name;
}

export function validateFileExtension(file, extensions) {
  const extension = file?.name?.split(".").pop()?.toLowerCase();
  return extensions.includes(extension);
}
