import { useState, useCallback, useRef } from "react";

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const SUPPORTED_DOC_TYPES = ["application/pdf", "text/plain", "text/csv", "text/markdown"];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result is a DataURL: "data:<mime>;base64,<data>"
      // Strip the prefix to get raw base64
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function getFileCategory(type) {
  if (SUPPORTED_IMAGE_TYPES.includes(type)) return "image";
  if (SUPPORTED_DOC_TYPES.includes(type)) return "document";
  if (type.startsWith("text/")) return "document";
  return "unsupported";
}

/**
 * Hook for drag-and-drop file handling in the chat interface.
 *
 * Returns:
 *   - isDragging: bool — true while a drag is active over the zone
 *   - attachments: [{ id, name, type, category, size, base64, previewUrl }]
 *   - dragProps: spread onto the drop target container
 *   - removeAttachment(id): remove a single attachment
 *   - clearAttachments(): remove all attachments
 *   - openFilePicker(): programmatically open the file input
 *   - fileInputRef: attach to a hidden <input type="file">
 */
export function useFileDropzone() {
  const [isDragging, setIsDragging] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [errors, setErrors] = useState([]);
  const dragCounterRef = useRef(0); // track nested dragenter/dragleave
  const fileInputRef = useRef(null);

  const processFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    const newErrors = [];
    const newAttachments = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        newErrors.push(`${file.name} is too large (max ${MAX_FILE_SIZE_MB}MB)`);
        continue;
      }

      const category = getFileCategory(file.type);
      if (category === "unsupported") {
        newErrors.push(`${file.name}: unsupported file type (${file.type || "unknown"})`);
        continue;
      }

      try {
        const base64 = await readFileAsBase64(file);
        const previewUrl =
          category === "image" ? `data:${file.type};base64,${base64}` : null;

        newAttachments.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          type: file.type || "application/octet-stream",
          category,
          size: file.size,
          base64,
          previewUrl,
        });
      } catch (err) {
        newErrors.push(`${file.name}: failed to read file`);
      }
    }

    if (newErrors.length) setErrors((prev) => [...prev, ...newErrors]);
    if (newAttachments.length) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  const onDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files?.length) processFiles(files);
    },
    [processFiles]
  );

  const onFileInputChange = useCallback(
    (e) => {
      if (e.target.files?.length) {
        processFiles(e.target.files);
        e.target.value = ""; // reset so same file can be picked again
      }
    },
    [processFiles]
  );

  const removeAttachment = useCallback((id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
    setErrors([]);
  }, []);

  const clearErrors = useCallback(() => setErrors([]), []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const dragProps = { onDragEnter, onDragLeave, onDragOver, onDrop };

  return {
    isDragging,
    attachments,
    errors,
    dragProps,
    removeAttachment,
    clearAttachments,
    clearErrors,
    openFilePicker,
    fileInputRef,
    onFileInputChange,
  };
}
