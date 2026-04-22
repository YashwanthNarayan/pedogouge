#!/usr/bin/env node
// CLI entry — real subcommands implemented in T packages/cli/src/commands/
import meow from "meow";

const cli = meow(
  `
  Usage
    $ pedagogue <command> [options]

  Commands
    new      Start a new Pedagogue session (intake)
    run      Run your code with AI narration
    status   Show your skill graph as ASCII tree
    defend   Open the voice defense in your browser

  Options
    --help     Show this help
    --version  Show version

  Examples
    $ pedagogue new
    $ pedagogue run python main.py
    $ pedagogue status
    $ pedagogue defend
`,
  {
    importMeta: import.meta,
    flags: {},
  },
);

const [command, ...args] = cli.input;

switch (command) {
  case "new":
    console.log("pedagogue new — T packages/cli stub");
    break;
  case "run":
    console.log(`pedagogue run ${args.join(" ")} — T packages/cli stub`);
    break;
  case "status":
    console.log("pedagogue status — T packages/cli stub");
    break;
  case "defend":
    console.log("pedagogue defend — T packages/cli stub");
    break;
  default:
    cli.showHelp();
}
