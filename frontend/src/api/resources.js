import { api } from "./client.js";

export async function fetchDatabases(config) {
  const { data } = await api.get("/database", { timeout: 15000, ...config });
  return data;
}

export async function fetchDocuments(config) {
  const { data } = await api.get("/document", { timeout: 15000, ...config });
  return data;
}

export async function fetchClassifications(config) {
  const { data } = await api.get("/classify", { timeout: 15000, ...config });
  return data;
}

export async function createDatabaseApi(name, file) {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("file", file);
  return api.post("/database", formData);
}

export async function createDocumentApi(name, file, text, useText) {
  const formData = new FormData();
  formData.append("name", name);
  if (useText) {
    formData.append("text", text);
  } else {
    formData.append("file", file);
  }
  return api.post("/document", formData);
}

export async function deleteResource(endpoint, id) {
  return api.delete(`/${endpoint}/${id}`);
}

export async function downloadResourceBlob(endpoint, id) {
  return api.get(`/${endpoint}/${id}`, { responseType: "blob" });
}

export async function createClassificationApi(body) {
  const { data } = await api.post("/classify", body);
  return data;
}

export async function fetchMlStatus(config) {
  const { data } = await api.get("/ml/status", { timeout: 15000, ...config });
  return data;
}

export async function fetchClassificationResult(id) {
  const { data } = await api.get(`/classify/${id}`);
  return {
    ...data.classification_result,
    classification_kind:
      data.classification_result?.classification_kind ||
      data.classifier_method ||
      "dictionary",
  };
}
