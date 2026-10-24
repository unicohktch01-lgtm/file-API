
/**
 * EditorAPI
 * ブラウザ用ファイル操作API
 *
 * 機能:
 * - ファイルを開く
 * - フォルダを開く
 * - ファイルを保存する
 * - 対応ブラウザでは上書き保存する
 */
const EditorAPI = (() => {
  // ファイル選択ダイアログ
  function selectFile(accept) {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      if (accept) input.accept = accept;

      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        try {
          resolve({
            name: file.name,
            size: file.size,
            type: file.type,
            text: await file.text(),
            file
          });
        } catch (error) {
          reject(error);
        }
      }, { once: true });

      input.addEventListener("cancel", () => resolve(null), {
        once: true
      });

      input.click();
    });
  }

  // 1. ファイルを開く
  async function openFile(options = {}) {
    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: options.types || []
        });

        if (!handle) return null;

        const file = await handle.getFile();

        return {
          name: file.name,
          size: file.size,
          type: file.type,
          text: await file.text(),
          handle,
          file
        };
      } catch (error) {
        if (error.name === "AbortError") return null;
        throw error;
      }
    }

    // 非対応ブラウザ用
    return selectFile(options.accept);
  }

  // 2. フォルダを開く
  async function openFolder() {
    if ("showDirectoryPicker" in window) {
      try {
        const handle = await window.showDirectoryPicker({
          mode: "read"
        });

        const files = [];

        async function scan(directory, path = "") {
          for await (const [name, entry] of directory.entries()) {
            const relativePath = path
              ? `${path}/${name}`
              : name;

            if (entry.kind === "file") {
              const file = await entry.getFile();

              files.push({
                name: file.name,
                path: relativePath,
                size: file.size,
                type: file.type,
                handle: entry,
                file
              });
            } else if (entry.kind === "directory") {
              await scan(entry, relativePath);
            }
          }
        }

        await scan(handle);

        return {
          name: handle.name,
          handle,
          files
        };
      } catch (error) {
        if (error.name === "AbortError") return null;
        throw error;
      }
    }

    // 非対応ブラウザ用
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.setAttribute("webkitdirectory", "");

      input.addEventListener("change", () => {
        const selected = Array.from(input.files || []);

        if (!selected.length) {
          resolve(null);
          return;
        }

        resolve({
          name: selected[0].webkitRelativePath.split("/")[0],
          handle: null,
          files: selected.map(file => ({
            name: file.name,
            path: file.webkitRelativePath,
            size: file.size,
            type: file.type,
            handle: null,
            file
          }))
        });
      }, { once: true });

      input.addEventListener("cancel", () => resolve(null), {
        once: true
      });

      input.click();
    });
  }

  // 3. ファイルを保存する
  async function saveFile(text, options = {}) {
    const data = String(text);
    const filename = options.suggestedName || "untitled.txt";
    const mimeType = options.mimeType || "text/plain";

    // 既存ファイルへの上書き、または指定フォルダへの保存
    if (options.handle || options.directoryHandle) {
      let handle = options.handle;

      if (!handle) {
        handle = await options.directoryHandle.getFileHandle(
          filename,
          { create: true }
        );
      }

      const writable = await handle.createWritable();
      try {
        await writable.write(data);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
      }

      return {
        name: handle.name,
        handle,
        saved: true
      };
    }

    // 保存先を選べるブラウザ
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: "Text file",
            accept: { [mimeType]: [getExtension(filename)] }
          }]
        });

        const writable = await handle.createWritable();
        try {
          await writable.write(data);
          await writable.close();
        } catch (error) {
          await writable.abort().catch(() => {});
          throw error;
        }

        return {
          name: handle.name,
          handle,
          saved: true
        };
      } catch (error) {
        if (error.name === "AbortError") return null;
        throw error;
      }
    }

    // 非対応ブラウザ用：ダウンロード
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return {
      name: filename,
      handle: null,
      saved: true,
      method: "download"
    };
  }

  function getExtension(filename) {
    const index = filename.lastIndexOf(".");
    return index >= 0 ? filename.slice(index) : ".txt";
  }

  return Object.freeze({
    openFile,
    openFolder,
    saveFile
  });
})();
