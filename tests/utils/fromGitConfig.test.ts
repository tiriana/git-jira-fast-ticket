import simpleGit, { SimpleGit } from 'simple-git';
import { fromGitConfig } from '../../src/utils/fromGitConfig';

jest.mock('simple-git');

describe('fromGitConfig', () => {
  let mockGit: jest.Mocked<SimpleGit>;

  beforeEach(() => {
    mockGit = {
      raw: jest.fn(),
    } as unknown as jest.Mocked<SimpleGit>;
    (simpleGit as jest.MockedFunction<typeof simpleGit>).mockReturnValue(mockGit);
  });

  it('should return the local git config value if found', async () => {
    mockGit.raw.mockResolvedValueOnce('localValue\n');

    const source = fromGitConfig('test.key', 'local');
    const result = await source();

    expect(result).toBe('localValue');
    expect(mockGit.raw).toHaveBeenCalledWith(['config', '--local', '--get', 'test.key']);
  });

  it('should return the global git config value if found', async () => {
    mockGit.raw.mockResolvedValueOnce('globalValue\n');

    const source = fromGitConfig('test.key', 'global');
    const result = await source();

    expect(result).toBe('globalValue');
    expect(mockGit.raw).toHaveBeenCalledWith(['config', '--global', '--get', 'test.key']);
  });

  it('should use local scope by default if not specified', async () => {
    mockGit.raw.mockResolvedValueOnce('defaultLocalValue\n');

    const source = fromGitConfig('test.key');
    const result = await source();

    expect(result).toBe('defaultLocalValue');
    expect(mockGit.raw).toHaveBeenCalledWith(['config', '--local', '--get', 'test.key']);
  });

  it('should search through multiple scopes and return the first found value', async () => {
    mockGit.raw.mockRejectedValueOnce(new Error('Not found in global')).mockResolvedValueOnce('localValue\n');

    const source = fromGitConfig('test.key', ['global', 'local']);
    const result = await source();

    expect(result).toBe('localValue');
    expect(mockGit.raw).toHaveBeenCalledTimes(2);
    expect(mockGit.raw).toHaveBeenNthCalledWith(1, ['config', '--global', '--get', 'test.key']);
    expect(mockGit.raw).toHaveBeenNthCalledWith(2, ['config', '--local', '--get', 'test.key']);
  });

  it('should return null if the git config key is not found in any specified scope', async () => {
    mockGit.raw.mockRejectedValueOnce(new Error('Not found in global')).mockRejectedValueOnce(new Error('Not found in local'));

    const source = fromGitConfig('nonexistent.key', ['global', 'local']);
    const result = await source();

    expect(result).toBeNull();
    expect(mockGit.raw).toHaveBeenCalledTimes(2);
  });
});
