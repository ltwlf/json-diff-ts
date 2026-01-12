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

export function arrayDifference<T>(first: T[], second: T[]): T[] {
    const secondSet = new Set(second);
    return first.filter(item => !secondSet.has(item));
}

export function arrayIntersection<T>(first: T[], second: T[]): T[] {
    const secondSet = new Set(second);
    return first.filter(item => secondSet.has(item));
}

export function keyBy<T>(arr: T[], getKey: (item: T, index: number) => any): Record<string, T> {
    const result: Record<string, T> = {};
    for (const [index, item] of Object.entries(arr)) {
        result[String(getKey(item, Number(index)))] = item;
    }
    return result;
}

export function setByPath(obj: any, path: string, value: any): void {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current)) {
            current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
        }
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
}
