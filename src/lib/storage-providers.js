/**
 * Storage Providers for BYOS (Bring Your Own Storage)
 * Supports: reshot (platform), s3, r2, local
 * 
 * This module allows CLI to work standalone or paired with the platform
 */
const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");
const chalk = require("chalk");

/**
 * Storage configuration schema
 * @typedef {Object} StorageConfig
 * @property {'reshot'|'s3'|'r2'|'local'} type - Storage provider type
 * @property {string} [bucket] - Bucket name (for s3/r2)
 * @property {string} [region] - AWS region (for s3)
 * @property {string} [pathPrefix] - Path prefix for assets
 * @property {string} [endpoint] - Custom endpoint (for r2)
 * @property {string} [accountId] - Cloudflare account ID (for r2)
 * @property {string} [publicDomain] - Public domain for asset URLs
 * @property {string} [outputDir] - Output directory (for local)
 */

/**
 * Validate storage configuration and check for required credentials
 * @param {StorageConfig} config - Storage configuration
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function validateStorageConfig(config) {
  const errors = [];
  const warnings = [];
  
  if (!config || !config.type) {
    return { valid: true, errors: [], warnings: ['No storage configuration - using platform mode (requires auth)'] };
  }
  
  switch (config.type) {
    case 'reshot':
      // Platform mode - requires API key (from auth or env)
      if (!process.env.RESHOT_API_KEY) {
        warnings.push('Platform storage requires API key. Run "reshot auth" or set RESHOT_API_KEY environment variable.');
      }
      break;
      
    case 's3':
      // AWS S3 - requires credentials and bucket
      if (!config.bucket) {
        errors.push('S3 storage requires "bucket" in storage config');
      }
      if (!process.env.AWS_ACCESS_KEY_ID) {
        errors.push('S3 storage requires AWS_ACCESS_KEY_ID environment variable');
      }
      if (!process.env.AWS_SECRET_ACCESS_KEY) {
        errors.push('S3 storage requires AWS_SECRET_ACCESS_KEY environment variable');
      }
      if (!config.region && !process.env.AWS_REGION) {
        warnings.push('No AWS region specified. Defaulting to us-east-1');
      }
      break;
      
    case 'r2':
      // Cloudflare R2 - requires credentials, account ID, and bucket
      if (!config.bucket) {
        errors.push('R2 storage requires "bucket" in storage config');
      }
      if (!config.accountId && !process.env.CLOUDFLARE_ACCOUNT_ID) {
        errors.push('R2 storage requires "accountId" in config or CLOUDFLARE_ACCOUNT_ID environment variable');
      }
      if (!process.env.R2_ACCESS_KEY_ID && !process.env.AWS_ACCESS_KEY_ID) {
        errors.push('R2 storage requires R2_ACCESS_KEY_ID (or AWS_ACCESS_KEY_ID) environment variable');
      }
      if (!process.env.R2_SECRET_ACCESS_KEY && !process.env.AWS_SECRET_ACCESS_KEY) {
        errors.push('R2 storage requires R2_SECRET_ACCESS_KEY (or AWS_SECRET_ACCESS_KEY) environment variable');
      }
      break;
      
    case 'local':
      // Local storage - just needs output directory
      if (!config.outputDir) {
        config.outputDir = './.reshot/published';
        warnings.push(`No output directory specified. Using default: ${config.outputDir}`);
      }
      break;
      
    default:
      errors.push(`Unknown storage type: ${config.type}. Supported: reshot, s3, r2, local`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get storage provider help text
 * @param {string} type - Storage type
 * @returns {string}
 */
function getStorageSetupHelp(type) {
  switch (type) {
    case 's3':
      return `
${chalk.cyan('AWS S3 Setup:')}

1. ${chalk.yellow('Create or get your AWS credentials:')}
   - Go to AWS Console > IAM > Users > Your User > Security credentials
   - Create an access key pair

2. ${chalk.yellow('Set environment variables:')}
   ${chalk.gray('export AWS_ACCESS_KEY_ID="your-access-key-id"')}
   ${chalk.gray('export AWS_SECRET_ACCESS_KEY="your-secret-access-key"')}
   ${chalk.gray('export AWS_REGION="us-east-1"  # optional, defaults to us-east-1')}

3. ${chalk.yellow('Update reshot.config.json:')}
   ${chalk.gray(JSON.stringify({
     storage: {
       type: 's3',
       bucket: 'your-bucket-name',
       region: 'us-east-1',
       pathPrefix: 'docs-assets/',
       publicDomain: 'https://your-bucket.s3.amazonaws.com'
     }
   }, null, 2))}

4. ${chalk.yellow('Ensure bucket permissions:')}
   - Bucket must allow uploads from your credentials
   - For public assets, configure bucket policy for public read access
`;

    case 'r2':
      return `
${chalk.cyan('Cloudflare R2 Setup:')}

1. ${chalk.yellow('Create R2 bucket and API token:')}
   - Go to Cloudflare Dashboard > R2 > Create bucket
   - Create an API token with R2 read/write permissions

2. ${chalk.yellow('Set environment variables:')}
   ${chalk.gray('export CLOUDFLARE_ACCOUNT_ID="your-account-id"')}
   ${chalk.gray('export R2_ACCESS_KEY_ID="your-r2-access-key"')}
   ${chalk.gray('export R2_SECRET_ACCESS_KEY="your-r2-secret-key"')}

3. ${chalk.yellow('Update reshot.config.json:')}
   ${chalk.gray(JSON.stringify({
     storage: {
       type: 'r2',
       bucket: 'your-bucket-name',
       accountId: 'your-cloudflare-account-id',
       pathPrefix: 'docs-assets/',
       publicDomain: 'https://assets.yourdomain.com'
     }
   }, null, 2))}

4. ${chalk.yellow('(Optional) Configure custom domain:')}
   - Set up R2 custom domain for public access
   - Add publicDomain to config for correct manifest URLs
`;

    case 'local':
      return `
${chalk.cyan('Local Storage Setup:')}

For local testing or self-hosted scenarios:

1. ${chalk.yellow('Update reshot.config.json:')}
   ${chalk.gray(JSON.stringify({
     storage: {
       type: 'local',
       outputDir: './published-assets',
       publicDomain: 'https://your-domain.com/assets'
     }
   }, null, 2))}

2. ${chalk.yellow('Assets will be saved to:')}
   <projectRoot>/<outputDir>/

3. ${chalk.yellow('Deploy the output directory')} to your web server
   and update publicDomain to match the public URL.
`;

    case 'reshot':
    default:
      return `
${chalk.cyan('Reshot Platform Setup:')}

Use Reshot for full governance features (review queue, version control, etc.):

1. ${chalk.yellow('Authenticate:')}
   ${chalk.gray('reshot auth')}

2. ${chalk.yellow('Or set environment variable:')}
   ${chalk.gray('export RESHOT_API_KEY="your-api-key"')}

3. ${chalk.yellow('Config (optional):')}
   ${chalk.gray(JSON.stringify({
     storage: {
       type: 'reshot'
     }
   }, null, 2))}

Benefits of Reshot Platform:
- Visual review queue with approval workflow
- Version history and rollback
- Unbreakable URLs that never change
- Team collaboration and RBAC
- Changelog generation from commits
`;
  }
}

/**
 * Base storage provider interface
 */
class BaseStorageProvider {
  constructor(config) {
    this.config = config;
  }
  
  async upload(filePath, key, contentType) {
    throw new Error('upload() must be implemented by subclass');
  }
  
  async generateManifest(uploads) {
    throw new Error('generateManifest() must be implemented by subclass');
  }
  
  getPublicUrl(key) {
    throw new Error('getPublicUrl() must be implemented by subclass');
  }
}

/**
 * Local file system storage provider
 */
class LocalStorageProvider extends BaseStorageProvider {
  constructor(config) {
    super(config);
    const resolved = path.resolve(process.cwd(), config.outputDir || './.reshot/published');
    const projectRoot = process.cwd();
    if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
      throw new Error(`Output directory must be within the project root: ${projectRoot}. Got: ${resolved}`);
    }
    this.outputDir = resolved;
    this.publicDomain = config.publicDomain || '';
  }
  
  async upload(filePath, key, contentType) {
    const destPath = path.join(this.outputDir, key);
    await fs.ensureDir(path.dirname(destPath));
    await fs.copy(filePath, destPath);
    
    return {
      success: true,
      path: key,
      publicUrl: this.getPublicUrl(key),
      hash: await this._hashFile(filePath),
    };
  }
  
  getPublicUrl(key) {
    if (this.publicDomain) {
      const domain = this.publicDomain.replace(/\/$/, '');
      return `${domain}/${key}`;
    }
    return `file://${path.join(this.outputDir, key)}`;
  }
  
  async generateManifest(uploads) {
    const manifest = {
      generated: new Date().toISOString(),
      provider: 'local',
      outputDir: this.outputDir,
      publicDomain: this.publicDomain || null,
      assets: {},
    };
    
    for (const upload of uploads) {
      manifest.assets[upload.key] = {
        localPath: path.join(this.outputDir, upload.path),
        publicUrl: upload.publicUrl,
        hash: upload.hash,
        contentType: upload.contentType,
      };
    }
    
    const manifestPath = path.join(this.outputDir, 'manifest.json');
    await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
    
    return { manifestPath, manifest };
  }
  
  async _hashFile(filePath) {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}

/**
 * AWS S3 storage provider
 */
class S3StorageProvider extends BaseStorageProvider {
  constructor(config) {
    super(config);
    this.bucket = config.bucket;
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.pathPrefix = (config.pathPrefix || '').replace(/\/$/, '');
    this.publicDomain = config.publicDomain;
    this._s3Client = null;
  }
  
  async _getClient() {
    if (!this._s3Client) {
      // Dynamic import to avoid requiring AWS SDK when not using S3
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      this.S3Client = S3Client;
      this.PutObjectCommand = PutObjectCommand;
      
      this._s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
    }
    return this._s3Client;
  }
  
  async upload(filePath, key, contentType) {
    const client = await this._getClient();
    const content = await fs.readFile(filePath);
    const fullKey = this.pathPrefix ? `${this.pathPrefix}/${key}` : key;
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    
    // Include hash in path for immutability
    const hashedKey = this._addHashToKey(fullKey, hash);
    
    const command = new this.PutObjectCommand({
      Bucket: this.bucket,
      Key: hashedKey,
      Body: content,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable', // Long cache for immutable assets
    });
    
    await client.send(command);
    
    return {
      success: true,
      path: hashedKey,
      publicUrl: this.getPublicUrl(hashedKey),
      hash,
    };
  }
  
  _addHashToKey(key, hash) {
    const ext = path.extname(key);
    const base = key.slice(0, -ext.length);
    return `${base}-${hash}${ext}`;
  }
  
  getPublicUrl(key) {
    if (this.publicDomain) {
      const domain = this.publicDomain.replace(/\/$/, '');
      return `${domain}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
  
  async generateManifest(uploads) {
    const manifest = {
      generated: new Date().toISOString(),
      provider: 's3',
      bucket: this.bucket,
      region: this.region,
      publicDomain: this.publicDomain || null,
      assets: {},
    };
    
    for (const upload of uploads) {
      manifest.assets[upload.key] = {
        s3Key: upload.path,
        publicUrl: upload.publicUrl,
        hash: upload.hash,
        contentType: upload.contentType,
      };
    }
    
    // Save manifest locally
    const manifestDir = path.join(process.cwd(), '.reshot', 'manifests');
    await fs.ensureDir(manifestDir);
    const manifestPath = path.join(manifestDir, `manifest-${Date.now()}.json`);
    await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
    
    // Also save as latest
    const latestPath = path.join(manifestDir, 'manifest-latest.json');
    await fs.writeJSON(latestPath, manifest, { spaces: 2 });
    
    return { manifestPath: latestPath, manifest };
  }
}

/**
 * Cloudflare R2 storage provider
 */
class R2StorageProvider extends BaseStorageProvider {
  constructor(config) {
    super(config);
    this.bucket = config.bucket;
    this.accountId = config.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
    this.pathPrefix = (config.pathPrefix || '').replace(/\/$/, '');
    this.publicDomain = config.publicDomain;
    this._s3Client = null;
  }
  
  async _getClient() {
    if (!this._s3Client) {
      // R2 uses S3-compatible API
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      this.S3Client = S3Client;
      this.PutObjectCommand = PutObjectCommand;
      
      const endpoint = `https://${this.accountId}.r2.cloudflarestorage.com`;
      
      this._s3Client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
    }
    return this._s3Client;
  }
  
  async upload(filePath, key, contentType) {
    const client = await this._getClient();
    const content = await fs.readFile(filePath);
    const fullKey = this.pathPrefix ? `${this.pathPrefix}/${key}` : key;
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    
    // Include hash in path for immutability
    const hashedKey = this._addHashToKey(fullKey, hash);
    
    const command = new this.PutObjectCommand({
      Bucket: this.bucket,
      Key: hashedKey,
      Body: content,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });
    
    await client.send(command);
    
    return {
      success: true,
      path: hashedKey,
      publicUrl: this.getPublicUrl(hashedKey),
      hash,
    };
  }
  
  _addHashToKey(key, hash) {
    const ext = path.extname(key);
    const base = key.slice(0, -ext.length);
    return `${base}-${hash}${ext}`;
  }
  
  getPublicUrl(key) {
    if (this.publicDomain) {
      const domain = this.publicDomain.replace(/\/$/, '');
      return `${domain}/${key}`;
    }
    // R2 doesn't have a default public URL - must use custom domain or R2.dev
    return `https://${this.bucket}.${this.accountId}.r2.dev/${key}`;
  }
  
  async generateManifest(uploads) {
    const manifest = {
      generated: new Date().toISOString(),
      provider: 'r2',
      bucket: this.bucket,
      accountId: this.accountId,
      publicDomain: this.publicDomain || null,
      assets: {},
    };
    
    for (const upload of uploads) {
      manifest.assets[upload.key] = {
        r2Key: upload.path,
        publicUrl: upload.publicUrl,
        hash: upload.hash,
        contentType: upload.contentType,
      };
    }
    
    // Save manifest locally
    const manifestDir = path.join(process.cwd(), '.reshot', 'manifests');
    await fs.ensureDir(manifestDir);
    const manifestPath = path.join(manifestDir, `manifest-${Date.now()}.json`);
    await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
    
    // Also save as latest
    const latestPath = path.join(manifestDir, 'manifest-latest.json');
    await fs.writeJSON(latestPath, manifest, { spaces: 2 });
    
    return { manifestPath: latestPath, manifest };
  }
}

/**
 * Create storage provider based on config
 * @param {StorageConfig} config - Storage configuration
 * @returns {BaseStorageProvider}
 */
function createStorageProvider(config) {
  if (!config || !config.type || config.type === 'reshot') {
    return null; // Use platform API client instead
  }
  
  switch (config.type) {
    case 's3':
      return new S3StorageProvider(config);
    case 'r2':
      return new R2StorageProvider(config);
    case 'local':
      return new LocalStorageProvider(config);
    default:
      throw new Error(`Unknown storage type: ${config.type}`);
  }
}

/**
 * Determine storage mode from config
 * @param {object} docSyncConfig - The reshot.config.json content
 * @returns {'platform'|'byos'}
 */
function getStorageMode(docSyncConfig) {
  const storageConfig = docSyncConfig?.storage;
  if (!storageConfig || !storageConfig.type || storageConfig.type === 'reshot') {
    return 'platform';
  }
  return 'byos';
}

/**
 * Check if platform features are available (auth present)
 * @returns {boolean}
 */
function isPlatformAvailable() {
  return !!(process.env.RESHOT_API_KEY || 
    (fs.existsSync(path.join(process.cwd(), '.reshot', 'settings.json')) &&
     fs.readJSONSync(path.join(process.cwd(), '.reshot', 'settings.json'), { throws: false })?.apiKey));
}

module.exports = {
  validateStorageConfig,
  getStorageSetupHelp,
  createStorageProvider,
  getStorageMode,
  isPlatformAvailable,
  LocalStorageProvider,
  S3StorageProvider,
  R2StorageProvider,
};
