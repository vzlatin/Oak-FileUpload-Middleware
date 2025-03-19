import { ensureDir, ensureDirSync } from "@std/fs";
import { type Middleware } from "@oak/oak/middleware";
import { Context } from "@oak/oak/context";
import { join } from "@std/path";

/**
 * This module contains middlware that manages file uploads in the context of Deno's Oak middleware framework.
 * It will create the appropriate directories if they don't exist, will validate the data and will save the data
 * to the context's state for subsequent downstream processing as well as write the files to the filesystem.
 * This module is heavily inspired successor of the hviana/Upload-middleware-for-Oak-Deno-framework which uses
 * more modern standard libraries and native apis as well as removing the use of deprecated and broken packages.
 * This module doesn't include the preUploadValidate method, because the same validation is performed ahead of writing
 * files to disk.
 * @module
 */

/**
 * Options to configure the file upload behavior.
 */
interface UploadOptions {
  /**
   * List of allowed file extensions for upload.
   * If not provided, all extensions are allowed.
   */
  extensions?: Array<string>;

  /**
   * Maximum allowed size for all uploaded files combined (in bytes).
   * Defaults to `Number.MAX_SAFE_INTEGER` (no limit).
   */
  maxSizeBytes?: number;

  /**
   * Maximum allowed size for a single file (in bytes).
   * Defaults to `Number.MAX_SAFE_INTEGER` (no limit).
   */
  maxFileSizeBytes?: number;

  /**
   * Whether to save the file to disk.
   * Defaults to `true`.
   */
  saveFile?: boolean;

  /**
   * Whether to read the file content into memory.
   * Defaults to `false`.
   */
  readFile?: boolean;

  /**
   * Whether to use the current directory as the base directory for storing files.
   * Defaults to `true`.
   */
  useCurrentDir?: boolean;

  /**
   * Whether to store the file in a subdirectory based on the current date and time.
   * Defaults to `true`.
   */
  useDateTimeSubDir?: boolean;

  /**
   * A callback function that is called when an error occurs during file processing.
   * Defaults to `console.log`.
   */
  onError?: (ctx: Context, error: unknown) => Promise<void> | void;
}

/**
 * The type representation of a processed(uploaded) file.
 */
interface ProcessedFile {
  /** The name of the file. */
  filename: string;
  /** The size of the file, in bytes. */
  size: number;
  /** The type of the file expressed as Blob.type property which reads the MIME type of the file. */
  type: string;
  /** The file contents expressed as a Uint8Array, or null. */
  contents: Uint8Array | null;
  /** The file path */
  uri: string;
  /** The URI Encoded file path */
  url: string;
}

/**
 * The type representation of the result of the middleware execution stored on the context's state.uploadedFiles property.
 * Check {@link ProcessedFile} for more details.
 */
interface Result {
  data: Record<string, ProcessedFile>;
}

/**
 * The class containing the properties and methods required to process the incoming multipart request.
 * The only exported member is the handler() method which returns a function that follows the oak's
 * Middleware type signature.
 */
export class FileUploader {
  private path: string;
  private options: Required<UploadOptions>;
  private defaultOptions: Required<UploadOptions> = {
    extensions: [],
    maxSizeBytes: Number.MAX_SAFE_INTEGER,
    maxFileSizeBytes: Number.MAX_SAFE_INTEGER,
    saveFile: true,
    readFile: false,
    useCurrentDir: true,
    useDateTimeSubDir: true,
    onError: console.log,
  };
  private validationErrors: string[] = [];
  private result: Result = { data: {} };

  /**
   * Creates an instance of FileUploader to handle file uploads.
   *
   * @param path The base directory where the uploaded files should be stored.
   * @param options Optional configuration options to customize the upload behavior.
   *                See {@link UploadOptions} interface for more details
   *
   * @returns An instance of FileUploader.
   */
  constructor(path: string, options: Partial<UploadOptions>) {
    this.path = path;
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Returns the middleware function to handle file uploads.
   * The processed files data {@link ProcessedFile} is stored in the ctx.state.uploadedFiles to be
   * accessed downstream in the subsequent middlewares.
   * The errors are caught and executed agains the onError hook in case there's a custom error handling
   * implementation.
   *
   * @returns Middleware function to be used in the Oak application.
   */
  handler(): Middleware {
    ensureDirSync(join(Deno.cwd(), "temp_uploads"));

    const middleware: Middleware = async (ctx, next) => {
      try {
        const { request } = ctx;
        if (!request.hasBody) throw new Error("Request is missing a body");

        const contentLength = request.headers.get("content-length");
        const contentType = request.headers.get("content-type");
        if (!contentLength) throw new Error("Content length is 0");
        if (!contentType) throw new Error("Content type is missing");
        if (parseInt(contentLength) > this.options.maxSizeBytes) {
          throw new Error(
            `Total upload size exceeded. Uploaded: ${contentLength}. Allowed maximum: ${this.options.maxSizeBytes}`,
          );
        }

        const boundary = ((contentType: string): string | null => {
          const match = contentType.match(/boundary=(.*)$/);
          return match ? match[1] : null;
        })(contentType);

        if (!boundary) {
          throw new Error(
            "Invalid form data. The request body should be encoded as 'multipart/form-data'.",
          );
        }

        const formData = await request.body.formData();
        const entries = Array.from(formData);

        for (const [key, value] of entries) {
          if (value instanceof File) {
            this.result.data[key] = await this.processFiles([value]);
          } else if (Array.isArray(value)) {
            const files = value.filter((f) => f instanceof File);
            if (files.length > 0) {
              this.result.data[key] = await this.processFiles(files);
            }
          }
        }

        if (this.validationErrors.length > 0) {
          throw new Error(
            `Unprocessable Entity: ${this.validationErrors.join(" ")}`,
          );
        }

        ctx.state.uploadedFiles = this.result;
        await next();
      } catch (error) {
        const processedErrorResult = this.options.onError(ctx, error);
        if (processedErrorResult instanceof Promise) await processedErrorResult;
      }
      await next();
    };

    return middleware;
  }

  private async processFiles(
    files: File[],
  ): Promise<ProcessedFile> {
    const processedFile: ProcessedFile = {
      filename: "",
      contents: null,
      size: 0,
      type: "",
      uri: "",
      url: "",
    };

    for (const file of files) {
      const filename = file.name;
      const extension = filename.split(".").pop() ?? "";

      processedFile.filename = filename;
      processedFile.type = file.type;
      processedFile.size = file.size;

      if (!extension && !this.options.extensions.includes(extension)) {
        this.validationErrors.push(
          `File extension ${extension} in ${filename} is not allowed. Allowed extentions: ${this.options.extensions.join()}.`,
        );
        // Skip this iteration. It doesn't matter if the validation fails downstream.
        continue;
      }

      if (file.size > this.options.maxFileSizeBytes) {
        this.validationErrors.push(
          `File size exceeds limit. File: ${file.name}, Size: ${file.size} bytes, Limit: ${this.options.maxFileSizeBytes} bytes. `,
        );
        // Skip this iteration. It doesn't matter if the validation fails downstream.
        continue;
      }

      if (this.options.readFile) {
        const contents = await file.arrayBuffer();
        processedFile.contents = new Uint8Array(contents);
      }

      if (this.options.saveFile) {
        const savedFilePath = await this.saveFileToDisk(file);
        processedFile.uri = savedFilePath;
        processedFile.url = savedFilePath.replace(Deno.cwd(), "").replace(
          /\\/g,
          "/",
        );
        if (!processedFile.url.startsWith("/")) {
          processedFile.url = "/" + processedFile.url;
        }
        processedFile.url = encodeURI(processedFile.url);
      } else {
        const tempUploadsDir = join(Deno.cwd(), "temp_uploads");
        const tempFilePath = join(
          tempUploadsDir,
          `${crypto.randomUUID()}_${file.name}`,
        );
        const tempContents = await file.arrayBuffer();
        await Deno.writeFile(tempFilePath, new Uint8Array(tempContents));

        processedFile.uri = tempFilePath;
        processedFile.url = "";
      }
    }
    return processedFile;
  }

  private async saveFileToDisk(file: File): Promise<string> {
    let uploadPath = this.path;

    if (this.options.useDateTimeSubDir) {
      const now = new Date();

      // We just care about a randomly generated uuid
      // to avoid naming collisions
      const subDirTree = join(
        now.getFullYear().toString(),
        (now.getMonth() + 1).toString().padStart(2, "0"),
        now.getDate().toString().padStart(2, "0"),
        now.getHours().toString().padStart(2, "0"),
        now.getMinutes().toString().padStart(2, "0"),
        now.getSeconds().toString().padStart(2, "0"),
        crypto.randomUUID(),
      );
      uploadPath = join(this.path, subDirTree);
    }

    const fullPath = this.options.useCurrentDir
      ? join(Deno.cwd(), uploadPath)
      : uploadPath;

    await ensureDir(fullPath);

    const filePath = join(fullPath, file.name);
    const contents = await file.arrayBuffer();
    await Deno.writeFile(filePath, new Uint8Array(contents));

    return filePath;
  }
}
