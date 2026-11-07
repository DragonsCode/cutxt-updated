import { Modal } from "@mantine/core";
import { ClassificationForm } from "../ClassificationForm.jsx";

export function ClassifyModal({ opened, onClose, ...props }) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Новый анализ"
      centered
      size="lg"
      closeOnClickOutside={!props.submitting}
      closeOnEscape={!props.submitting}
      withCloseButton={!props.submitting}
    >
      <ClassificationForm {...props} compact />
    </Modal>
  );
}
