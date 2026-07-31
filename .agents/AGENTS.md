# Custom Agent Rules

**Rule**: Before applying any codebase changes or executing new implementation plans, you MUST ALWAYS read the `app-errors.log` file in the project root. If the file exists and has content, you must address and fix the errors recorded in it first. Once you have fixed the issue causing the error, delete the contents of `app-errors.log` (or delete the file entirely) and wait for new errors before proceeding with other user requests.
