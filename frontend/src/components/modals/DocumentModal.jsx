import {
  Modal,
  TextInput,
  Button,
  Group,
  Stack,
  Textarea,
  SegmentedControl,
  FileInput,
  Text,
} from "@mantine/core";
import { IconUpload, IconFileText, IconCheck } from "@tabler/icons-react";
import { basenameNoExt } from "../../utils/files.js";

export function DocumentModal({
  opened,
  onClose,
  formState,
  setFormState,
  onSubmit,
  submitting,
  errors,
  onClearError,
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Добавить документ"
      centered
      size="lg"
      closeOnClickOutside={!submitting}
      closeOnEscape={!submitting}
      withCloseButton={!submitting}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Stack gap="lg">
          <Text size="sm" c="dimmed">
            Загрузите файл или вставьте текст. Документ сохранится в библиотеке
            и будет доступен для анализа.
          </Text>
          <SegmentedControl
            fullWidth
            value={formState.useText ? "text" : "file"}
            disabled={submitting}
            onChange={(value) => {
              onClearError?.("docFile");
              onClearError?.("docText");
              setFormState((previous) => ({
                ...previous,
                useText: value === "text",
              }));
            }}
            data={[
              { label: "Загрузить файл", value: "file" },
              { label: "Вставить текст", value: "text" },
            ]}
          />
          {formState.useText ? (
            <Textarea
              label="Текст документа"
              placeholder="Вставьте текст, который нужно классифицировать…"
              minRows={7}
              autosize
              maxRows={14}
              value={formState.docText}
              disabled={submitting}
              onChange={(event) => {
                onClearError?.("docText");
                setFormState((previous) => ({
                  ...previous,
                  docText: event.target.value,
                }));
              }}
              error={errors.docText}
              required
            />
          ) : (
            <div className="upload-area">
              <IconUpload size={30} stroke={1.5} />
              <h3>Документ для вашей библиотеки</h3>
              <p>Поддерживаются PDF и DOCX</p>
              <FileInput
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                placeholder="Выбрать файл"
                aria-label="Файл документа"
                value={formState.docFile}
                disabled={submitting}
                onChange={(file) => {
                  onClearError?.("docFile");
                  onClearError?.("docName");
                  setFormState((previous) => ({ ...previous, docFile: file }));
                }}
                error={errors.docFile}
                leftSection={<IconFileText size={17} />}
                clearable
              />
            </div>
          )}
          <TextInput
            label="Название документа"
            placeholder={
              formState.useText
                ? "Например: отчёт за октябрь"
                : basenameNoExt(formState.docFile) ||
                  "Например: договор поставки"
            }
            description={
              formState.useText
                ? "Название поможет найти текст в библиотеке"
                : "Если оставить пустым, используем имя файла"
            }
            value={formState.docName}
            disabled={submitting}
            onChange={(event) => {
              onClearError?.("docName");
              setFormState((previous) => ({
                ...previous,
                docName: event.target.value,
              }));
            }}
            error={errors.docName}
            required={formState.useText}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" disabled={submitting} onClick={onClose}>
              Отмена
            </Button>
            <Button
              type="submit"
              loading={submitting}
              leftSection={<IconCheck size={17} />}
            >
              Сохранить документ
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
