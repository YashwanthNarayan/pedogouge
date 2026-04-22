import JSZip from "jszip";

export interface SourceFile {
  path: string;
  content: string;
}

function makefile(entrypoint: string, lang: string): string {
  let cmd: string;
  switch (lang) {
    case "python":
      cmd = `\tpython3 ${entrypoint}`;
      break;
    case "javascript":
      cmd = `\tnode ${entrypoint}`;
      break;
    case "typescript": {
      const jsOut = entrypoint.replace(/\.tsx?$/, ".js");
      cmd = `\ttsc ${entrypoint} && node ${jsOut}`;
      break;
    }
    case "java": {
      const className = entrypoint.replace(/\.java$/, "").replace(/.*\//, "");
      cmd = `\tjavac ${entrypoint} && java ${className}`;
      break;
    }
    case "cpp":
      cmd = `\tg++ -o main ${entrypoint} && ./main`;
      break;
    case "c":
      cmd = `\tgcc -o main ${entrypoint} && ./main`;
      break;
    default:
      cmd = `\t./${entrypoint}`;
  }
  return `all:\n${cmd}\n`;
}

/**
 * Packages source files + a generated Makefile into a base64 ZIP.
 * Judge0 language_id=89 extracts this ZIP and runs `make` to execute.
 */
export async function buildZip(
  files: SourceFile[],
  entrypoint: string,
  lang: string,
): Promise<string> {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.path, file.content);
  }

  zip.file("Makefile", makefile(entrypoint, lang));

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return buf.toString("base64");
}
