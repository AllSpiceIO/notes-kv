import { getInput, info, warning, setFailed, debug } from "@actions/core"
import { readFile } from "node:fs/promises"
import { exec } from "@actions/exec"

/**
 * The name of the ref used to store KV notes.
 */
const CUSTOM_NOTES_REF = "notes-kv"

/**
 * Parses input strings of the form "key1=value1\nkey2=value2" into a key-value object.
 * @param input - The input string to parse.
 * @returns A key-value object.
 * @throws If the input is not in the expected format.
 */
const parseInput = (input: string): Record<string, string> => {
  const pairs = input
    .trim()
    .split("\n")
    .map(line =>
      line
        .trim()
        .split("=")
        .map(part => part.trim()),
    )

  const invalidLines = pairs.filter(
    pair => pair.length !== 2 || !pair[0] || !pair[1],
  )

  if (invalidLines.length > 0) {
    debug("Input: " + input)
    throw new Error(
      `Invalid input format on lines: ${invalidLines.map((_, i) => i + 1).join(", ")}`,
    )
  }

  return Object.fromEntries(pairs)
}

/**
 * Reads the input values from the provided values or values_file input.
 * @param valuesInput - The values input string.
 * @param valuesFile - The values file path.
 * @returns The key-value object parsed from the input.
 * @throws If both values and values_file are provided, if neither are
 * provided, if the values file cannot be read, or if the input is invalid.
 */
const readInput = async (
  valuesInput: string,
  valuesFile: string,
): Promise<Record<string, any>> => {
  if (
    valuesInput &&
    valuesInput.trim() !== "" &&
    valuesFile &&
    valuesFile.trim() !== ""
  ) {
    throw new Error("Both values and values_file cannot be provided.")
  }

  if (valuesInput && valuesInput.trim() !== "") {
    return parseInput(valuesInput)
  }

  if (valuesFile && valuesFile.trim() !== "") {
    const content = await readFile(valuesFile, "utf8")
    const json_object = JSON.parse(content)

    // We can't store an array or a primitive; we need an object.
    if (typeof json_object !== "object") {
      throw new Error("Input must be a JSON object.")
    }

    return json_object
  }

  throw new Error("Either values or values_file must be provided.")
}

/**
 * Executes a git command and returns the output on STDOUT.
 * @param args - The arguments to pass to the git command.
 * @returns The output of the git command.
 * @throws If the git command fails.
 */
const execGit = async (...args: string[]): Promise<string> => {
  let output = ""
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
      },
    },
  }

  const code = await exec("git", args, options)
  if (code !== 0) {
    throw new Error(`Failed to run git ${args.join(" ")}`)
  }

  return output.trim()
}

const getCurrentCommit = async (): Promise<string> => {
  return await execGit("rev-parse", "HEAD")
}

const fetchNotesRef = async (notesRef: string): Promise<void> => {
  try {
    await execGit(
      "fetch",
      "origin",
      `refs/notes/${notesRef}:refs/notes/${notesRef}`,
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error occurred while fetching notes"
    info(
      `Note: ${message}. This may be normal when adding notes for the first time.`,
    )
  }
}

const addOrUpdateNotes = async (
  notes: Record<string, string>,
  commitSha: string,
  notesRef: string,
): Promise<void> => {
  let existingNote = ""
  try {
    existingNote = await execGit("notes", "--ref", notesRef, "show")
    info("Existing note found. Preparing to update.")
  } catch (error) {
    info("No existing note found. A new note will be created.")
  }

  if (existingNote) {
    try {
      const existingNotes = JSON.parse(existingNote)
      notes = { ...existingNotes, ...notes }
      info(`Merged notes: ${JSON.stringify(notes)}`)
    } catch (error) {
      warning(
        "Failed to parse existing note as JSON. Overwriting with new note.",
      )
    }
  }

  await execGit(
    "notes",
    "--ref",
    notesRef,
    "add",
    "-f",
    "-m",
    JSON.stringify(notes),
    commitSha,
  )

  info("Note added or updated successfully.")
}

const pushNotes = async (): Promise<void> => {
  await execGit("push", "origin", `refs/notes/*`, "-f")
}

const run = async () => {
  try {
    const values = getInput("values")
    const valuesFile = getInput("values_file")
    const notesRefInput = getInput("custom_ref")

    const notes = await readInput(values, valuesFile)
    info(`Notes to store: ${JSON.stringify(notes)}`)

    if (Object.keys(notes).length === 0) {
      info("No values provided. Skipping note storage.")
      return
    }

    const notesRef =
      notesRefInput && notesRefInput.trim() !== ""
        ? notesRefInput
        : CUSTOM_NOTES_REF

    const commitSha = await getCurrentCommit()
    await fetchNotesRef(notesRef)
    await addOrUpdateNotes(notes, commitSha, notesRef)
    await pushNotes()

    info("Notes stored successfully.")
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message)
    } else {
      setFailed(`An unknown error occurred: ${error}`)
    }
  }
}

run()
