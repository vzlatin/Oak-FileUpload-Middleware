# FileUploader Middleware

`FileUploader` is a flexible middleware for handling file uploads in Deno. It
supports a variety of options for customizing file upload behavior, such as file
size limits, file extensions, storage options, and more. This middleware is
designed to be used with the Oak framework. This package is heavily inspired and
is the natural successor of
[hviana/Upload-middleware-for-Oak-Deno-framework](https://github.com/hviana/Upload-middleware-for-Oak-Deno-framework).
It eliminates the broken and deprecated libraries and updates the functionality
by using Deno's native api and the standard library as well as some inner code
structure. Unlike the original implementation, this package lacks the
preUploadValidation middleware because the same verifications are performed
ahead of writing the file to disk by the current implemenation. There's no need
to have it extracted in a separate middleware, otherwise it's fairly simple to
derive from the current implementation's source code by yourself.

## Features

- Support for multiple file uploads
- Validation of file size and extension
- Option to read and save uploaded files
- Customizable upload paths with subdirectories based on date and time
- Error handling and customizable error responses
- Saves files to the server’s filesystem

## Installation

To use `FileUploader`, you need to install it in your Deno project. Add the
following import statement to your code:

```ts
import { FileUploader } from "path/to/FileUploader.ts";
```

## Usage

### 1. Initialize the `FileUploader` Class

Create an instance of the `FileUploader` class by passing a directory path and
optional configuration options:

```ts
import { FileUploader } from "path/to/FileUploader.ts";

const uploader = new FileUploader("uploads", {
  maxFileSizeBytes: 5 * 1024 * 1024, // Max file size: 5 MB
  extensions: ["jpg", "png", "gif"], // Allowed file extensions
  saveFile: true, // Save files to disk
  readFile: false, // Don't read files into memory
  onError: (ctx, error) => {/* Custom error handler */},
});
```

### 2. Add the Middleware to Your Oak App

Once you've created the `FileUploader` instance, use the `handler` method to get
the middleware function, and pass it to the Oak route handler:

```ts
import { Application } from "https://deno.land/x/oak/mod.ts";
import { FileUploader } from "path/to/FileUploader.ts";

const app = new Application();

const uploader = new FileUploader("uploads");

app.use(uploader.handler());

app.listen({ port: 8000 });
```

### 3. Example of Handling File Uploads

When files are uploaded, they will be stored according to the `saveFile` option.
If `saveFile` is set to `false`, the file will be stored in a temporary
location.

#### File upload response (via `ctx.state.uploadedFiles`):

```json
{
  "data": {
    "profile_picture": {
      "filename": "profile.jpg",
      "contents": null,
      "size": 2048,
      "type": "image/jpeg",
      "uri": "/uploads/2025/01/26/18/23/08/5b053289-28b2-4233-ae0c-09319f568006/profile.jpg",
      "url": "/uploads/2025/01/26/18/23/08/5b053289-28b2-4233-ae0c-09319f568006/profile.jpg"
    }
  }
}
```

- `uri`: The file path on the server’s filesystem.
- `url`: The URL you can use to access the file. If you are serving the files
  through a static file server, this would be the URL path to access the file.

## Configuration Options

You can customize the behavior of `FileUploader` through the following options:

### `path`

- **Type:** `string`
- **Description:** The base directory where uploaded files will be stored.
- **Default:** `"uploads"`

### `extensions`

- **Type:** `Array<string>`
- **Description:** A list of allowed file extensions. If the uploaded file’s
  extension is not in this list, it will be rejected.
- **Default:** `[]` (no restriction)

### `maxSizeBytes`

- **Type:** `number`
- **Description:** The maximum allowed total size of all files in a request (in
  bytes).
- **Default:** `Number.MAX_SAFE_INTEGER`

### `maxFileSizeBytes`

- **Type:** `number`
- **Description:** The maximum allowed size of a single uploaded file (in
  bytes).
- **Default:** `Number.MAX_SAFE_INTEGER`

### `saveFile`

- **Type:** `boolean`
- **Description:** If set to `true`, files will be saved to the server’s
  filesystem. If `false`, files will only be written to a temporary location.
- **Default:** `true`

### `readFile`

- **Type:** `boolean`
- **Description:** If set to `true`, the content of the files will be read into
  memory.
- **Default:** `false`

### `useCurrentDir`

- **Type:** `boolean`
- **Description:** If set to `true`, the path will be considered relative to the
  current working directory.
- **Default:** `true`

### `useDateTimeSubDir`

- **Type:** `boolean`
- **Description:** If set to `true`, the upload path will include subdirectories
  based on the current date and time (year/month/day/hour/minute/second).
- **Default:** `true`

### `onError`

- **Type:** `function`
- **Description:** A custom error handler that will be called in case of an
  error during the file upload process.
- **Default:** `console.log`

## Example Error Handling

You can customize how errors are handled during the upload process by providing
a custom `onError` function. For example:

```ts
const uploader = new FileUploader("uploads", {
  onError: (ctx, error) => {
    console.error("File upload error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "File upload failed" };
  },
});
```

## Methods

### `handler()`

This method returns the middleware function that should be used in your Oak
application.

- **Returns:** `Middleware` function.

```ts
const handler = uploader.handler();
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

---
