export function getDownloadFilename(blob, name) {
  const extensions = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "text/plain": ".txt",
  };
  const extension = extensions[blob.type?.split(";")[0]];
  return extension && !name.toLowerCase().endsWith(extension)
    ? `${name}${extension}`
    : name;
}

export function saveBlobAsFile(blobData, filename) {
  const url = window.URL.createObjectURL(
    blobData instanceof Blob ? blobData : new Blob([blobData]),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
