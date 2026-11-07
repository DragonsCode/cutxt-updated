import { useState, useEffect, useCallback, useRef } from "react";
import { formatApiError } from "../api/client.js";
import {
  fetchDatabases,
  fetchDocuments,
  fetchClassifications,
  fetchMlStatus,
} from "../api/resources.js";

const loaders = {
  databases: fetchDatabases,
  documents: fetchDocuments,
  classifications: fetchClassifications,
  mlStatus: fetchMlStatus,
};
const initialLoading = Object.fromEntries(
  Object.keys(loaders).map((key) => [key, true]),
);

export function useDashboardData() {
  const [data, setData] = useState({
    databases: [],
    documents: [],
    classifications: [],
    mlStatus: null,
  });
  const [loading, setLoading] = useState(initialLoading);
  const [errors, setErrors] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const controllers = useRef({});

  const refetch = useCallback(async (key) => {
    controllers.current[key]?.abort();
    const controller = new AbortController();
    controllers.current[key] = controller;
    setLoading((previous) => ({ ...previous, [key]: true }));
    try {
      const value = await loaders[key]({ signal: controller.signal });
      if (controller.signal.aborted) return;
      setData((previous) => ({ ...previous, [key]: value }));
      setErrors((previous) => ({ ...previous, [key]: null }));
      setLastUpdated(new Date());
    } catch (error) {
      if (!controller.signal.aborted)
        setErrors((previous) => ({
          ...previous,
          [key]: formatApiError(error),
        }));
    } finally {
      if (!controller.signal.aborted)
        setLoading((previous) => ({ ...previous, [key]: false }));
    }
  }, []);

  const refetchDatabases = useCallback(() => refetch("databases"), [refetch]);
  const refetchDocuments = useCallback(() => refetch("documents"), [refetch]);
  const refetchClassifications = useCallback(
    () => refetch("classifications"),
    [refetch],
  );
  const refreshAll = useCallback(
    () => Promise.all(Object.keys(loaders).map(refetch)),
    [refetch],
  );

  useEffect(() => {
    refreshAll();
    const activeControllers = controllers.current;
    return () =>
      Object.values(activeControllers).forEach((controller) =>
        controller.abort(),
      );
  }, [refreshAll]);

  return {
    ...data,
    loading,
    errors,
    lastUpdated,
    refetchDatabases,
    refetchDocuments,
    refetchClassifications,
    refreshAll,
  };
}
