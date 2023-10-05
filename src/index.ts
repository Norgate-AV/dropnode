#!/usr/bin/env node

import "dotenv/config";
import execa from "execa";
import { resolve } from "path";
import { glob } from "glob";
import chalk from "chalk";
import { checkbox } from "@inquirer/prompts";
import { ListrInquirerPromptAdapter } from "@listr2/prompt-adapter-inquirer";
import { Listr } from "listr2";

interface Context {
    paths: Array<string>;
}

(async () => {
    try {
        const cwd = process.cwd();

        const tasks = new Listr<Context>(
            [
                {
                    title: "Searching for node_modules",
                    task: async (ctx) => {
                        const paths = await glob(`${cwd}/**/node_modules`);

                        if (paths.length === 0) {
                            console.log(chalk.yellow("No node_modules found"));
                            process.exit(0);
                        }

                        ctx.paths = paths.filter(
                            (path) =>
                                path.indexOf("node_modules") ===
                                path.lastIndexOf("node_modules"),
                        );
                    },
                },
                {
                    task: async (ctx, task) => {
                        ctx.paths = await task
                            .prompt(ListrInquirerPromptAdapter)
                            .run(checkbox, {
                                message: "Select the node_modules to ignore",
                                choices: ctx.paths.map((path) =>
                                    path.replace(cwd, ""),
                                ),
                                pageSize: 20,
                            });
                    },
                },
                {
                    title: "Ignoring node_modules",
                    task: async (ctx) => {
                        for (let path of ctx.paths) {
                            path = resolve(cwd, path);

                            const getCommand = () => {
                                switch (process.platform) {
                                    case "win32":
                                        return {
                                            program: "powershell.exe",
                                            args: [
                                                "-Command",
                                                `Set-Content -Path '${path}' -Stream com.dropbox.ignored -Value 1`,
                                            ],
                                        };
                                    default:
                                        throw new Error("Unknown platform");
                                }
                            };

                            const command = getCommand();
                            await execa(command.program, command.args);
                        }
                    },
                },
            ],
            { concurrent: false },
        );

        await tasks.run();
        console.log(chalk.green("Complete!"));
    } catch (error) {
        console.error(chalk.red(error));
        process.exit(1);
    }
})();
