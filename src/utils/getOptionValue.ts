export type ConfigSource = () => Promise<string | null> | string | null;

/**
 * Retrieves the first non-null, non-empty value from an array of sources.
 * Each source can be synchronous or asynchronous.
 *
 * @param sources - An array of functions returning a value.
 * @returns The first valid value or null if none is found.
 */
export const getOptionValue = async (sources: ConfigSource[]): Promise<string | null> => {
    for (const source of sources) {
        const value = await source();  // Await to support async functions
        if (value) {
            return value;
        }
    }
    return null;  // Return null if no valid source provided a value
};
