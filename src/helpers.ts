export function splitJSONPath(path: string): string[] {
    const parts: string[] = [];
    let currentPart = '';
    let inSingleQuotes = false;
    let inBrackets = 0;

    for (let i = 0; i < path.length; i++) {
        const char = path[i];

        if (char === "'" && path[i - 1] !== '\\') {
            // Toggle single quote flag if not escaped
            inSingleQuotes = !inSingleQuotes;
        } else if (char === '[' && !inSingleQuotes) {
            // Increase bracket nesting level
            inBrackets++;
        } else if (char === ']' && !inSingleQuotes) {
            // Decrease bracket nesting level
            inBrackets--;
        }

        if (char === '.' && !inSingleQuotes && inBrackets === 0) {
            // Split at period if not in quotes or brackets
            parts.push(currentPart);
            currentPart = '';
        } else {
            // Otherwise, keep adding to the current part
            currentPart += char;
        }
    }

    // Add the last part if there's any
    if (currentPart !== '') {
        parts.push(currentPart);
    }

    return parts;
}
