(function () {
  const DEFAULT_PRESETS = {
    avatar: {
      maxWidth: 512,
      maxHeight: 512,
      targetBytes: 180 * 1024,
      maxBytes: 260 * 1024,
      mimeType: "image/jpeg",
    },
    question: {
      maxWidth: 1400,
      maxHeight: 1800,
      targetBytes: 450 * 1024,
      maxBytes: 750 * 1024,
      mimeType: "image/jpeg",
    },
    answer: {
      maxWidth: 1400,
      maxHeight: 1800,
      targetBytes: 450 * 1024,
      maxBytes: 750 * 1024,
      mimeType: "image/jpeg",
    },
    course: {
      maxWidth: 2000,
      maxHeight: 1200,
      targetBytes: 800 * 1024,
      maxBytes: 1100 * 1024,
      mimeType: "image/jpeg",
    },
    post: {
      maxWidth: 1600,
      maxHeight: 1600,
      targetBytes: 600 * 1024,
      maxBytes: 900 * 1024,
      mimeType: "image/jpeg",
    },
    default: {
      maxWidth: 1600,
      maxHeight: 1600,
      targetBytes: 500 * 1024,
      maxBytes: 900 * 1024,
      mimeType: "image/jpeg",
    },
  };

  function getSupabaseUrl() {
    return window.SUPABASE_URL || (typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : "");
  }

  function getSupabaseKey() {
    return window.SUPABASE_KEY || (typeof SUPABASE_KEY !== "undefined" ? SUPABASE_KEY : "");
  }

  function getPreset(kind, overrides) {
    return {
      ...DEFAULT_PRESETS.default,
      ...(DEFAULT_PRESETS[kind] || {}),
      ...(overrides || {}),
    };
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Cannot read image."));
      };
      img.src = url;
    });
  }

  async function readImage(file) {
    if ("createImageBitmap" in window) {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (_) {
        return fileToImage(file);
      }
    }
    return fileToImage(file);
  }

  function calculateSize(width, height, maxWidth, maxHeight, scale = 1) {
    const ratio = Math.min(maxWidth / width, maxHeight / height, 1) * scale;
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio)),
    };
  }

  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Cannot compress image."));
      }, mimeType, quality);
    });
  }

  async function renderBlob(image, options, quality, scale) {
    const size = calculateSize(
      image.width,
      image.height,
      options.maxWidth,
      options.maxHeight,
      scale
    );
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { alpha: options.mimeType !== "image/jpeg" });
    if (!ctx) throw new Error("Browser does not support image compression.");
    if (options.mimeType === "image/jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size.width, size.height);
    }
    ctx.drawImage(image, 0, 0, size.width, size.height);
    const blob = await canvasToBlob(canvas, options.mimeType, quality);
    return { blob, width: size.width, height: size.height };
  }

  async function compressImageFile(file, config = {}) {
    if (!(file instanceof File)) throw new Error("Missing image file.");
    if (!String(file.type || "").startsWith("image/")) throw new Error("Only image files are supported.");

    const kind = config.kind || "default";
    const options = getPreset(kind, config);
    const image = await readImage(file);
    const mimeType = options.mimeType || "image/jpeg";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    let best = null;

    for (const scale of [1, 0.9, 0.8, 0.7, 0.6]) {
      for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58, 0.5]) {
        const rendered = await renderBlob(image, { ...options, mimeType }, quality, scale);
        best = rendered;
        if (rendered.blob.size <= options.targetBytes) {
          return toCompressedResult(file, rendered, baseName, mimeType);
        }
      }
      if (best && best.blob.size <= options.maxBytes) break;
    }

    if (!best) throw new Error("Cannot compress image.");
    return toCompressedResult(file, best, baseName, mimeType);
  }

  function toCompressedResult(originalFile, rendered, baseName, mimeType) {
    const ext = mimeType === "image/png" ? "png" : "jpg";
    const compressedFile = new File(
      [rendered.blob],
      `${baseName}.${ext}`,
      { type: mimeType, lastModified: Date.now() }
    );
    return {
      file: compressedFile,
      originalSize: originalFile.size,
      compressedSize: compressedFile.size,
      width: rendered.width,
      height: rendered.height,
      compressionRatio: originalFile.size ? compressedFile.size / originalFile.size : 1,
    };
  }

  async function uploadCompressedImage(file, options = {}) {
    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseKey();
    if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase config.");

    const kind = options.kind || "question";
    const compressed = await compressImageFile(file, { ...options, kind });
    const form = new FormData();
    form.append("file", compressed.file);
    form.append("folder", options.folder || kind);

    const token = await window.AppAuth?.getAccessToken?.();
    const res = await fetch(`${supabaseUrl}/functions/v1/upload-drive-image`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token || supabaseKey}`,
      },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      throw new Error(data?.error || "Cannot upload image to Drive.");
    }

    return {
      ...data,
      compression: {
        originalSize: compressed.originalSize,
        compressedSize: compressed.compressedSize,
        width: compressed.width,
        height: compressed.height,
        compressionRatio: compressed.compressionRatio,
      },
    };
  }

  function dataUrlToFile(dataUrl, fileName = "image.jpg") {
    const parts = String(dataUrl || "").split(",");
    const mimeType = parts[0]?.match(/:(.*?);/)?.[1];
    if (!mimeType || !parts[1]) throw new Error("Invalid image data.");
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], fileName, { type: mimeType, lastModified: Date.now() });
  }

  async function uploadDataUrl(dataUrl, options = {}) {
    const fileName = options.fileName || "image.jpg";
    return uploadCompressedImage(dataUrlToFile(dataUrl, fileName), options);
  }

  function getDisplayUrl(uploadResult) {
    return uploadResult?.lh3Url || uploadResult?.url || uploadResult?.downloadUrl || "";
  }

  function getDriveFileId(url) {
    const source = String(url || "").trim();
    if (!source) return "";
    const lh3Match = source.match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)/i);
    if (lh3Match) return lh3Match[1];
    const driveMatch = source.match(/^https:\/\/drive\.google\.com\/(?:uc\?[^#]*\bid=|file\/d\/)([\w-]+)/i);
    return driveMatch?.[1] || "";
  }

  async function deleteUploadedImage(urlOrFileId) {
    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = getSupabaseKey();
    if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase config.");

    const source = String(urlOrFileId || "").trim();
    const fileId = getDriveFileId(source) || (/^[\w-]+$/.test(source) ? source : "");
    if (!fileId) return { ok: true, skipped: true };

    const token = await window.AppAuth?.getAccessToken?.();
    const res = await fetch(`${supabaseUrl}/functions/v1/upload-drive-image`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${token || supabaseKey}`,
      },
      body: JSON.stringify({ fileId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      throw new Error(data?.error || "Cannot delete image from Drive.");
    }
    return data;
  }

  async function deleteUploadedImages(urls) {
    const uniqueUrls = [...new Set((urls || []).filter(Boolean))];
    return Promise.allSettled(uniqueUrls.map(deleteUploadedImage));
  }

  window.MindupImageUpload = {
    presets: DEFAULT_PRESETS,
    compressImageFile,
    uploadCompressedImage,
    uploadDataUrl,
    getDisplayUrl,
    getDriveFileId,
    deleteUploadedImage,
    deleteUploadedImages,
  };
})();
