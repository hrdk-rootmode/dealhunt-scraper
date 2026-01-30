const fs = require('fs');
const path = require('path');

class PlatformLoader {
  constructor() {
    this.platforms = new Map();
    this.loadAllPlatforms();
  }

  loadAllPlatforms() {
    const platformsDir = path.join(__dirname, '../platforms');
    
    try {
      // Check if platforms directory exists
      if (!fs.existsSync(platformsDir)) {
        console.warn('⚠️  Platforms directory not found, creating...');
        fs.mkdirSync(platformsDir, { recursive: true });
        return;
      }

      const files = fs.readdirSync(platformsDir);
      
      files.forEach(file => {
        if (file.endsWith('.js')) {
          try {
            const platformName = file.replace('.js', '');
            const PlatformClass = require(path.join(platformsDir, file));
            
            this.platforms.set(platformName, PlatformClass);
            console.log(`✅ Loaded platform: ${platformName}`);
          } catch (error) {
            console.error(`❌ Failed to load ${file}:`, error.message);
          }
        }
      });

      console.log(`\n📦 Total platforms loaded: ${this.platforms.size}\n`);
      
      if (this.platforms.size === 0) {
        console.warn('⚠️  No platforms loaded! Make sure to create platform files in src/scrapers/platforms/');
      }

    } catch (error) {
      console.error('❌ Error loading platforms:', error.message);
    }
  }

  getPlatform(platformName) {
    const PlatformClass = this.platforms.get(platformName.toLowerCase());
    if (!PlatformClass) {
      const available = Array.from(this.platforms.keys()).join(', ');
      throw new Error(`Platform "${platformName}" not found. Available: ${available || 'none'}`);
    }
    return new PlatformClass();
  }

  getAllPlatforms() {
    const instances = [];
    this.platforms.forEach((PlatformClass, name) => {
      instances.push(new PlatformClass());
    });
    return instances;
  }

  listPlatforms() {
    return Array.from(this.platforms.keys());
  }

  hasPlatform(platformName) {
    return this.platforms.has(platformName.toLowerCase());
  }
}

module.exports = new PlatformLoader(); // Singleton