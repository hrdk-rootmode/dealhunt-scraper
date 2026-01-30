const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class SelectorHealer {
  constructor(groqApiKey) {
    this.groqApiKey = groqApiKey;
    this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.patternsFile = path.join(__dirname, 'selector-patterns.json');
  }

  // Load current selector patterns
  async loadPatterns() {
    try {
      const data = await fs.readFile(this.patternsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading patterns:', error.message);
      return null;
    }
  }

  // Save updated patterns
  async savePatterns(patterns) {
    try {
      await fs.writeFile(
        this.patternsFile, 
        JSON.stringify(patterns, null, 2),
        'utf8'
      );
      console.log('✅ Selector patterns updated successfully');
      return true;
    } catch (error) {
      console.error('❌ Error saving patterns:', error.message);
      return false;
    }
  }

  // Ask Groq AI to find the correct selector
  async findSelector(platform, fieldName, htmlSample) {
    console.log(`\n🤖 Asking Groq AI to find ${fieldName} selector...`);

    const prompt = `You are an expert web scraper. Analyze this HTML from ${platform}.in and find the CSS selector for: ${fieldName}

HTML Sample:
\`\`\`html
${htmlSample}
\`\`\`

Requirements:
- Return ONLY a JSON object, no explanation
- Provide 3 alternative selectors (primary, fallback1, fallback2)
- Each selector should be specific but flexible
- Consider that Amazon frequently changes their HTML structure

Return format:
{
  "primary": "CSS selector here",
  "fallback1": "Alternative selector",
  "fallback2": "Another alternative",
  "explanation": "Brief explanation of why this selector works"
}

Field to find: ${this.getFieldDescription(fieldName)}`;

    try {
      const response = await axios.post(this.apiUrl, {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a web scraping expert specializing in e-commerce sites. Return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      const text = response.data.choices[0].message.content.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        console.error('❌ No valid JSON in Groq response');
        return null;
      }

      const result = JSON.parse(jsonMatch[0]);
      
      console.log(`✅ Groq found selectors:`);
      console.log(`   Primary: ${result.primary}`);
      console.log(`   Fallback: ${result.fallback1}`);
      console.log(`   Reason: ${result.explanation}`);

      return result;

    } catch (error) {
      console.error('❌ Groq API error:', error.message);
      return null;
    }
  }

  // Get field description for Groq
  getFieldDescription(fieldName) {
    const descriptions = {
      'current_price': 'The actual selling price (not strikethrough). Usually in format ₹54,999 or with class a-price-whole',
      'original_price': 'The strikethrough/MRP price. Usually has class a-text-price or appears crossed out',
      'rating': 'Star rating like "4.5 out of 5 stars". Usually in aria-label or icon text',
      'review_count': 'Number of reviews/ratings like "2,847 ratings" or "2.8K"',
      'title': 'Product name/title in the h2 or main heading',
      'image': 'Product thumbnail image, usually with class s-image',
      'product_url': 'Link to product detail page, usually in h2 a tag with href containing /dp/',
      'product_card': 'The main container div for each product in search results'
    };

    return descriptions[fieldName] || `The ${fieldName} field`;
  }

  // Try to extract data using multiple selectors
  trySelectors($, element, selectors, extractFn) {
    for (const selector of selectors) {
      try {
        const $el = $(element).find(selector);
        if ($el.length > 0) {
          const result = extractFn($el);
          if (result) {
            return { success: true, value: result, selector: selector };
          }
        }
      } catch (error) {
        // Continue to next selector
      }
    }
    return { success: false, value: null, selector: null };
  }

  // Main healing function - called when extraction fails
  async healSelector(platform, fieldName, $, element) {
    console.log(`\n🔧 Healing ${fieldName} selector for ${platform}...`);

    // Get HTML sample of the element
    const htmlSample = $(element).html();
    if (!htmlSample || htmlSample.length < 100) {
      console.error('❌ HTML sample too small to analyze');
      return null;
    }

    // Truncate to 5000 chars to save tokens
    const truncatedSample = htmlSample.substring(0, 5000);

    // Ask Groq for new selectors
    const newSelectors = await this.findSelector(platform, fieldName, truncatedSample);
    
    if (!newSelectors) {
      return null;
    }

    // Load current patterns
    const patterns = await this.loadPatterns();
    if (!patterns) {
      return null;
    }

    // Update patterns with new selectors
    if (!patterns[platform].patterns[fieldName]) {
      patterns[platform].patterns[fieldName] = { selectors: [], confidence: 0 };
    }

    // Add new selectors to the beginning (highest priority)
    patterns[platform].patterns[fieldName].selectors = [
      newSelectors.primary,
      newSelectors.fallback1,
      newSelectors.fallback2,
      ...patterns[platform].patterns[fieldName].selectors
    ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

    // Keep only top 5 selectors
    patterns[platform].patterns[fieldName].selectors = 
      patterns[platform].patterns[fieldName].selectors.slice(0, 5);

    // Update metadata
    patterns[platform].patterns[fieldName].last_healed = new Date().toISOString();
    patterns[platform].patterns[fieldName].confidence = 80; // Lower confidence after healing
    patterns[platform].last_updated = new Date().toISOString();

    // Save updated patterns
    await this.savePatterns(patterns);

    return newSelectors.primary;
  }

  // Update confidence when selector works
  async updateConfidence(platform, fieldName, selector, worked) {
    const patterns = await this.loadPatterns();
    if (!patterns || !patterns[platform].patterns[fieldName]) {
      return;
    }

    const field = patterns[platform].patterns[fieldName];

    if (worked) {
      // Increase confidence (max 100)
      field.confidence = Math.min(100, (field.confidence || 50) + 5);
      field.last_worked = new Date().toISOString();
      
      // Move working selector to top
      const index = field.selectors.indexOf(selector);
      if (index > 0) {
        field.selectors.splice(index, 1);
        field.selectors.unshift(selector);
      }
    } else {
      // Decrease confidence
      field.confidence = Math.max(0, (field.confidence || 50) - 10);
    }

    await this.savePatterns(patterns);
  }
}

module.exports = SelectorHealer;