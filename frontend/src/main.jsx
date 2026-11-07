import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles.css";
import App from "./App.jsx";

const theme = createTheme({
  primaryColor: "indigo",
  primaryShade: 6,
  defaultRadius: "md",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  headings: {
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontWeight: "650",
  },
  components: {
    Button: { defaultProps: { radius: "md", size: "sm", fw: 600 } },
    TextInput: { defaultProps: { size: "sm" } },
    Select: { defaultProps: { size: "sm" } },
    Modal: {
      defaultProps: {
        radius: "lg",
        closeButtonProps: { "aria-label": "Закрыть окно" },
        overlayProps: { backgroundOpacity: 0.35, blur: 5 },
      },
      styles: {
        title: { fontWeight: 650 },
        header: { padding: "22px 24px" },
        body: { padding: "0 24px 24px" },
      },
    },
  },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <ModalsProvider>
        <Notifications position="top-right" zIndex={4000} />
        <App />
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
);
