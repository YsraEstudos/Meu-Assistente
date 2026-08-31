const { desktopCapturer, screen } = require('electron');
const logger = require('../core/logger').createServiceLogger('CAPTURE');
const config = require('../core/config');
const performanceTracker = require('../core/performance');

class CaptureService {
  constructor() {
    this.isProcessing = false;
  }

  listDisplays() {
    try {
      const displays = screen.getAllDisplays().map(d => ({
        id: d.id,
        bounds: d.bounds,
        size: d.size,
        scaleFactor: d.scaleFactor,
        rotation: d.rotation,
        touchSupport: d.touchSupport || 'unknown'
      }));
      return { success: true, displays };
    } catch (error) {
      logger.error('Failed to list displays', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Capture screenshot and return an image buffer.
   * options: { displayId?: number, area?: { x, y, width, height } }
   */
  async captureAndProcess(options = {}) {
    if (this.isProcessing) throw new Error('Capture already in progress');
    this.isProcessing = true;
    const startTime = Date.now();
    const trace = performanceTracker.begin('screenshot-capture', { hasArea: Boolean(options.area) });
    let traceMetadata = { success: false };
    try {
      const { image, metadata } = await this.captureScreenshot(options);

      // Crop if area specified
      let finalImage = image;
      if (options.area) {
        if (!this._isValidArea(options.area)) {
          throw new Error('Invalid capture area: ' + JSON.stringify(options.area));
        }

        const clampedArea = this._clampAreaToImageBounds(options.area, image.getSize());
        if (!clampedArea) {
          throw new Error('Invalid capture area: ' + JSON.stringify(options.area));
        }

        try {
          finalImage = image.crop(clampedArea);
        } catch (e) {
          logger.error('Crop failed', { error: e.message, area: clampedArea });
          throw new Error('Capture crop failed: ' + e.message);
        }
      }

      const buffer = finalImage.toPNG();
      const finalSize = finalImage.getSize();
      logger.logPerformance('Screenshot capture', startTime, {
        bytes: buffer.length,
        dimensions: finalSize
      });
      traceMetadata = {
        success: true,
        bytes: buffer.length,
        width: finalSize.width,
        height: finalSize.height
      };

      return {
        imageBuffer: buffer,
        mimeType: 'image/png',
        metadata: {
          timestamp: new Date().toISOString(),
          source: metadata,
          processingTime: Date.now() - startTime
        }
      };
    } finally {
      performanceTracker.end(trace, traceMetadata);
      this.isProcessing = false;
    }
  }

  async captureScreenshot(options = {}) {
    const targetDisplay = this._getTargetDisplay(options.displayId);
    if (!targetDisplay) {
      throw new Error(`Requested display ${options.displayId} is unavailable`);
    }
    const { width, height } = targetDisplay.size || { width: 1920, height: 1080 };
    const maxDimension = Number(config.get('performance.screenshotMaxDimension')) || 2560;
    const displayMaxDimension = Math.max(width, height);
    const scale = !options.area && displayMaxDimension > maxDimension
      ? maxDimension / displayMaxDimension
      : 1;
    const thumbnailWidth = Math.max(1, Math.round(width * scale));
    const thumbnailHeight = Math.max(1, Math.round(height * scale));

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: thumbnailWidth, height: thumbnailHeight }
    });

    if (sources.length === 0) {
      throw new Error('No screen sources available for capture');
    }

    // Prefer the display identity exposed by Electron. Matching only by
    // thumbnail dimensions can select another monitor with the same resolution.
    let source = sources[0];
    const targetDisplayId = String(targetDisplay.id);
    const normalizedTargetId = targetDisplayId.replace(/\D/g, '');
    const displayIdMatch = sources.find(s => s.display_id != null && String(s.display_id) === targetDisplayId);
    const exactIdMatch = sources.find(s => String(s.id) === targetDisplayId);
    const sourceDisplayIdMatch = sources.find(s => {
      const match = String(s.id || '').match(/^screen:([^:]+)/i);
      return match && match[1] === targetDisplayId;
    });
    const normalizedIdMatch = sources.find(s => String(s.id).replace(/\D/g, '') === normalizedTargetId && normalizedTargetId !== '');
    const identityMatch = displayIdMatch || exactIdMatch || sourceDisplayIdMatch || normalizedIdMatch;
    if (options.displayId != null && !identityMatch) {
      throw new Error(`Unable to match requested display ${targetDisplayId} to a capture source`);
    }
    const match = identityMatch || sources.find(s => {
      const size = s.thumbnail.getSize();
      return size.width === thumbnailWidth && size.height === thumbnailHeight;
    });
    if (match) source = match;

    const image = source.thumbnail;
    if (!image) throw new Error('Failed to capture screen thumbnail');

    logger.debug('Screenshot captured successfully', {
      sourceName: source.name,
      imageSize: image.getSize()
    });

    return {
      image,
      metadata: {
        displayId: targetDisplay.id,
        sourceName: source.name,
        dimensions: image.getSize(),
        captureTime: new Date().toISOString()
      }
    };
  }

  _getTargetDisplay(displayId) {
    const all = screen.getAllDisplays();
    if (!all || all.length === 0) return displayId == null ? screen.getPrimaryDisplay() : null;
    if (displayId == null) return screen.getPrimaryDisplay();
    return all.find(d => String(d.id) === String(displayId)) || null;
  }

  _isValidArea(area) {
    return area && Number.isFinite(area.x) && Number.isFinite(area.y) &&
      Number.isFinite(area.width) && Number.isFinite(area.height) &&
      area.width > 0 && area.height > 0;
  }

  _clampAreaToImageBounds(area, imageSize) {
    if (!imageSize || !Number.isFinite(imageSize.width) || !Number.isFinite(imageSize.height)) return null;

    const x1 = Math.max(0, Math.floor(area.x));
    const y1 = Math.max(0, Math.floor(area.y));
    const x2 = Math.min(imageSize.width, Math.ceil(area.x + area.width));
    const y2 = Math.min(imageSize.height, Math.ceil(area.y + area.height));

    if (x1 >= imageSize.width || y1 >= imageSize.height || x2 <= 0 || y2 <= 0) return null;
    if (x2 <= x1 || y2 <= y1) return null;

    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }
}

module.exports = new CaptureService();
