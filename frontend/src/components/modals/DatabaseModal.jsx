import {
  Modal,
  TextInput,
  Button,
  Group,
  Stack,
  Text,
  FileInput,
} from "@mantine/core";
import { IconDatabase, IconUpload } from "@tabler/icons-react";
import { basenameNoExt } from "../../utils/files.js";

export function DatabaseModal({
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
      title="Загрузить эталонную базу"
      centered
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
            Словарь категорий и ключевых слов для сравнения с вашими
            документами.
          </Text>
          <div className="upload-area">
            <IconDatabase size={30} stroke={1.5} />
            <h3>Эталонный словарь</h3>
            <p>База SQLite в формате .db или .sqlite</p>
            <FileInput
              accept=".db,.sqlite"
              placeholder="Выбрать базу"
              aria-label="Файл эталонной базы"
              value={formState.dbFile}
              disabled={submitting}
              onChange={(file) => {
                onClearError?.("dbFile");
                onClearError?.("dbName");
                setFormState((previous) => ({ ...previous, dbFile: file }));
              }}
              error={errors.dbFile}
              leftSection={<IconDatabase size={17} />}
              clearable
            />
          </div>
          <TextInput
            label="Название базы"
            placeholder={
              basenameNoExt(formState.dbFile) ||
              "Например: категории документов"
            }
            description="Если оставить пустым, используем имя файла"
            value={formState.dbName}
            disabled={submitting}
            onChange={(event) => {
              onClearError?.("dbName");
              setFormState((previous) => ({
                ...previous,
                dbName: event.target.value,
              }));
            }}
            error={errors.dbName}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" disabled={submitting} onClick={onClose}>
              Отмена
            </Button>
            <Button
              type="submit"
              loading={submitting}
              leftSection={<IconUpload size={17} />}
            >
              Загрузить базу
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
