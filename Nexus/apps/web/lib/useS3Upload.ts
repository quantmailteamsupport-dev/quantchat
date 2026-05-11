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
      // 1. Get presigned URL from API Gateway
      const response = await fetch("/api/chat/media/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
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
