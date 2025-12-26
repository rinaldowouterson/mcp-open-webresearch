import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureLogger, logger, closeWritingStream } from '../../src/utils/logger.js';
import fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', async () => {
    return {
        default: {
            access: vi.fn(),
            writeFile: vi.fn(),
            open: vi.fn(),
            unlink: vi.fn(),
        }
    };
});

describe('Logger Utility', () => {
    
    beforeEach(async () => {
        vi.clearAllMocks();
        // Reset logger state
        configureLogger({ writeToTerminal: false, writeToFile: false });
        await closeWritingStream();
    });

    afterEach(async () => {
        await closeWritingStream();
        vi.restoreAllMocks();
    });

    it('should write to terminal when enabled', async () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        
        configureLogger({ writeToTerminal: true });
        
        await logger.debug('test message');
        
        expect(spy).toHaveBeenCalledWith('test message');
    });

    it('should NOT write to terminal when disabled', async () => {
        const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        
        configureLogger({ writeToTerminal: false });
        
        await logger.debug('test message');
        
        expect(spy).not.toHaveBeenCalled();
    });

    it('should write to file when enabled', async () => {
        // Mock file handle
        const mockWrite = vi.fn();
        const mockClose = vi.fn();
        const mockFileHandle = {
            write: mockWrite,
            close: mockClose
        };
        
        // Setup fs mocks
        vi.mocked(fs.access).mockResolvedValue(undefined); // File exists
        vi.mocked(fs.open).mockResolvedValue(mockFileHandle as any);
        
        configureLogger({ writeToFile: true });
        
        await logger.debug('file message');
        
        // Verification
        expect(fs.open).toHaveBeenCalled();
        expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('file message'));
    });

    it('should create file if it does not exist', async () => {
         // Mock file handle
        const mockWrite = vi.fn();
        const mockFileHandle = { write: mockWrite, close: vi.fn() };

        // Setup fs mocks to fail access (file not found) then succeed
        vi.mocked(fs.access).mockRejectedValue({ code: 'ENOENT' });
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.open).mockResolvedValue(mockFileHandle as any);

        configureLogger({ writeToFile: true });
        
        await logger.debug('new file message');
        
        expect(fs.writeFile).toHaveBeenCalled(); // Should create empty file
        expect(fs.open).toHaveBeenCalled();
        expect(mockWrite).toHaveBeenCalled();
    });
    
    it('should NOT write to file when disabled', async () => {
         configureLogger({ writeToFile: false });
         
         await logger.debug('no file message');
         
         expect(fs.open).not.toHaveBeenCalled();
    });
    
    it('should handle switching modes dynamically', async () => {
        const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        const mockWrite = vi.fn();
        const mockFileHandle = { write: mockWrite, close: vi.fn() };
        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.open).mockResolvedValue(mockFileHandle as any);
        
        // Start: Only Terminal
        configureLogger({ writeToTerminal: true, writeToFile: false });
        await logger.debug('msg1');
        expect(consoleSpy).toHaveBeenCalledWith('msg1');
        expect(fs.open).not.toHaveBeenCalled();
        
        // Switch: Only File
        consoleSpy.mockClear();
        configureLogger({ writeToTerminal: false, writeToFile: true });
        await logger.debug('msg2');
        expect(consoleSpy).not.toHaveBeenCalled();
        expect(fs.open).toHaveBeenCalled();
        expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('msg2'));
    });
});
