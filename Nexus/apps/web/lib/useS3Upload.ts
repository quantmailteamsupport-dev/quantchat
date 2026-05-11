/**
 * Nexus/apps/web/lib/useS3Upload.ts
 * 
 * Production S3 upload hook for QuantChat.
 * Handles presigned URL retrieval and direct-to-S3 multi-part uploads.
 */

import { useCallback, useState } from "react";

interface UploadOptions {
  fileName: string;
  fileType: string;
  onProgress?: (percent: number) => void;
}

interface UploadResult {
  fileKey: string;
  downloadUrl: string;
}

export function useS3Upload() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File, options: Omit<UploadOptions, "fileName" | "fileType"> = {}): Promise<UploadResult> => {
    setIsUploading(true);
    setError(null);

    try {
      // Guard against oversized files before hitting the server
      const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("File too large. Maximum allowed size is 100 MB.");
      }

      // Read CSRF token from the meta tag injected by Next.js
      const csrfMeta = typeof document !== "undefined"
        ? document.querySelector('meta[name="csrf-token"]')
        : null;
      const csrfToken = csrfMeta?.getAttribute("content") ?? "";

      // 1. Get presigned URL from API Gateway
      const response = await fetch("/api/chat/media/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "Failed to get presigned URL");
      }

      const { uploadUrl, downloadUrl, fileKey } = await response.json();

      // 2. Upload directly to S3
      const xhr = new XMLHttpRequest();
      
      const uploadPromise = new Promise<void>((resolve, reject) => {
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && options.onProgress) {
            const percent = Math.round((event.loaded / event.total) * 100);
            options.onProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) resolve();
          else reject(new Error(`S3 upload failed with status ${xhr.status}`));
        };

        xhr.onerror = () => reject(new Error("Network error during S3 upload"));
        xhr.send(file);
      });

      await uploadPromise;

      // Notify gateway that upload is complete so file status is updated
      try {
        await fetch(`/api/media/${encodeURIComponent(fileKey)}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileSize: file.size }),
        });
      } catch {
        // Non-fatal: status update failure doesn't block the upload result
      }

      setIsUploading(false);
      return { fileKey, downloadUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      setIsUploading(false);
      throw err;
    }
  }, []);

  return { uploadFile, isUploading, error };
}
