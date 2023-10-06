#!/usr/bin/env node

import "dotenv/config";
import execa from "execa";
import os from "os";
import { resolve } from "path";
import { glob } from "glob";
import chalk from "chalk";
import { checkbox } from "@inquirer/prompts";
import { ListrInquirerPromptAdapter } from "@listr2/prompt-adapter-inquirer";
import { Listr } from "listr2";
import isWsl from "is-wsl";

interface Ctx {
    paths: string[];
}

(async () => {
    try {
        const cwd = process.cwd();

        const tasks = new Listr<Ctx>(
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
                    title: "Select node_modules to ignore",
                    task: async (ctx, task): Promise<string[]> => {
                        const paths = await task
                            .prompt<ListrInquirerPromptAdapter>(
                                ListrInquirerPromptAdapter,
                            )
                            .run(checkbox, {
                                message: "Select node_modules to ignore",
                                choices: ctx.paths.map((path) => ({
                                    name: path.replace(cwd, ""),
                                    value: path,
                                })),
                                pageSize: 20,
                            });

                        return paths as string[];
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
                                            options: {},
                                        };
                                    case "darwin":
                                        return {
                                            program: "xattr",
                                            args: [
                                                "-w",
                                                "com.dropbox.ignored",
                                                "1",
                                                `"${path.replace(
                                                    `${cwd}/`,
                                                    "",
                                                )}"`,
                                            ],
                                            options: {
                                                uid: os.userInfo().uid,
                                            },
                                        };
                                    case "linux":
                                        return isWsl
                                            ? {
                                                  program: "powershell.exe",
                                                  args: [
                                                      "-Command",
                                                      `Set-Content -Path '${path.replace(
                                                          `/mnt/${
                                                              path.split("/")[2]
                                                          }`,
                                                          `${
                                                              path.split("/")[2]
                                                          }:`,
                                                      )}' -Stream com.dropbox.ignored -Value 1`,
                                                  ],
                                                  options: {},
                                              }
                                            : {
                                                  program: "attr",
                                                  args: [
                                                      "-s",
                                                      "com.dropbox.ignored",
                                                      "-V",
                                                      "1",
                                                      path,
                                                  ],
                                                  options: {},
                                              };
                                    default:
                                        throw new Error(
                                            "Unknown Operating System",
                                        );
                                }
                            };

                            const command = getCommand();
                            await execa(
                                command.program,
                                command.args,
                                command.options,
                            );
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
