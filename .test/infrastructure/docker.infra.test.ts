import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';

// Helper to run docker-compose commands with activity-based timeout
const runComposeWithActivityTimeout = (
  composeFile: string, 
  args: string[], 
  activityTimeoutMs = 600000 // 10 minutes default
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const cmdArgs = ['-f', composeFile, ...args];
        console.log(`[Docker] Running: docker-compose ${cmdArgs.join(' ')}`);

        const ps = spawn('docker-compose', cmdArgs, {
            cwd: path.resolve(__dirname, '../../'),
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Log Buffer for debugging
        const logBuffer: string[] = [];
        const BUFFER_SIZE = 1000;
        
        const pushLog = (line: string) => {
            logBuffer.push(line);
            if (logBuffer.length > BUFFER_SIZE) logBuffer.shift();
            // Also stream to console for live feedback
            process.stdout.write(line + '\n');
        };

        // Activity Timer Logic
        let timer: NodeJS.Timeout;
        let manuallyKilled = false;

        const refreshTimer = () => {
             if (timer) clearTimeout(timer);
             timer = setTimeout(() => {
                 onTimeout();
             }, activityTimeoutMs);
        };

        const onTimeout = () => {
            console.error('\n\n!!! TIMEOUT DETECTED: No output for 300s !!!');
            console.error('--- LAST 1000 LINES OF LOGS ---');
            logBuffer.forEach(l => console.error(l));
            console.error('-------------------------------');
            
            ps.kill(); // Kill the docker-compose process
            reject(new Error(`Validation Timeout: No activity for ${activityTimeoutMs}ms`));
        };

        // Initialize Timer
        refreshTimer();

        // Listeners
        ps.stdout.on('data', (data) => {
            refreshTimer();
            const lines = data.toString().split('\n');
            lines.forEach((line: string) => {
                if(line.trim()) pushLog(`[STDOUT] ${line.trim()}`);
            });
            
            // Success Criteria Detection for Production Check
            // We verify the server is running by looking at the logs.
            if (data.toString().includes('Server is running on port 3000')) {
                 if (args.includes('up')) {
                     // If we are "upping" production, this is success.
                     // But we wait for clean exit? No, up keeps running.
                     // IMPORTANT: For 'up' without detach, it blocks.
                     // If we see the success message, we can resolve immediately?
                     // BUT we need to kill the process to proceed?
                     // Or we run detached and user manual verification?
                     // The requirement is "A test that runs".
                     
                     // For 'production' verifying success means finding the string.
                     // We resolve successfully.
                     // But we must remember to kill this spawn!
                     manuallyKilled = true;
                     ps.kill('SIGINT'); // Graceful stop
                     resolve();
                 }
            }
        });

        ps.stderr.on('data', (data) => {
            refreshTimer();
            const lines = data.toString().split('\n');
             lines.forEach((line: string) => {
                if(line.trim()) pushLog(`[STDERR] ${line.trim()}`);
            });
        });

        ps.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0 || code === null) { // null if killed by us
                resolve();
            } else {
                // If it was the Production Verification case and we killed it (SIGINT), code might be non-zero (130).
                // We should handle that.
                if (args.includes('up') && !args.includes('--abort-on-container-exit')) {
                    // This was likely a manual kill after success detection
                    if (manuallyKilled) {
                        resolve();
                    } else {
                        reject(new Error(`Process exited unexpectedly with code ${code}`));
                    }
                } else {
                    reject(new Error(`Process exited with code ${code}`));
                }
            }
        });

        ps.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
};

const cleanup = async () => {
    console.log('[Cleanup] Removing containers and images...');
    // We run standard down commands.
    // We use spawnSync for cleanup to ensure it completes.
    const { spawnSync } = await import('child_process');
    const files = ['.test/docker/docker-compose.test.yml', '.test/docker/docker-compose.prod.test.yml'];
    
    for (const file of files) {
         console.log(`[Cleanup] Down: ${file}`);
         spawnSync('docker-compose', ['-f', file, 'down', '-v', '--rmi', 'local', '--remove-orphans'], {
             cwd: path.resolve(__dirname, '../../'),
             stdio: 'inherit'
         });
    }
};

describe('Infrastructure Verification', () => {
    
    // Increase Test Timeout to accommodate Docker builds (e.g. 30 mins)
    // The activity timeout is internal to runComposeWithActivityTimeout
    const TEST_TIMEOUT = 3600000; 

    afterAll(async () => {
        await cleanup();
    });



    it('should build and run PRODUCTION container successfully', async () => {
        if (process.env.DOCKER_ENVIRONMENT) return;

        // Runs interactively (not detached) so we can stream logs and find the success message.
        await runComposeWithActivityTimeout(
            '.test/docker/docker-compose.prod.test.yml',
            ['--env-file', '.test/docker/.env', 'up', '--build', '--force-recreate'],
             1800000 // 20 min activity timeout 
        );
    }, TEST_TIMEOUT);

    it('should build and run TEST SUITE container successfully', async () => {
        if (process.env.DOCKER_ENVIRONMENT) {
            console.log("Skipping Docker Infrastructure test inside Docker");
            return;
        }

        // Runs until exit (abort-on-container-exit).
        // Success is exit code 0.
        await runComposeWithActivityTimeout(
            '.test/docker/docker-compose.test.yml',
            ['up', '--build', '--force-recreate', '--abort-on-container-exit', '--exit-code-from', 'test'],
            1800000
        );
    }, TEST_TIMEOUT);
});
