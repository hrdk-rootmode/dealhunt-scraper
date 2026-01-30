require('dotenv').config();
const axios = require('axios');

// ==================== TEST GEMINI ====================
async function testGemini() {
    console.log('\n' + '='.repeat(60));
    console.log('🤖 TESTING GEMINI AI');
    console.log('='.repeat(60));
    
    const apiKey = process.env.GEMINI_API_KEY;
    
    console.log('🔑 API Key exists:', !!apiKey);
    console.log('🔑 API Key starts with:', apiKey?.substring(0, 10));
    console.log('🔑 API Key length:', apiKey?.length);
    
    if (!apiKey) {
        console.log('❌ GEMINI_API_KEY not found in .env\n');
        return false;
    }
    
    // Try both v1 and v1beta endpoints
    const endpoints = [
        {
            name: 'v1/gemini-1.5-flash',
            url: `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`
        },
        {
            name: 'v1beta/gemini-1.5-flash',
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
        },
        {
            name: 'v1/gemini-pro',
            url: `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${apiKey}`
        },
        {
            name: 'v1beta/gemini-pro',
            url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`
        }
    ];
    
    for (const endpoint of endpoints) {
        console.log(`\n📡 Testing: ${endpoint.name}...`);
        
        try {
            const response = await axios.post(endpoint.url, {
                contents: [{
                    parts: [{
                        text: "Say 'Hello! I am working perfectly!'"
                    }]
                }]
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            });
            
            const reply = response.data.candidates[0].content.parts[0].text;
            console.log(`✅ SUCCESS! Reply: "${reply}"`);
            console.log(`✅ Working endpoint: ${endpoint.name}\n`);
            return endpoint.name;
            
        } catch (error) {
            const status = error.response?.status;
            const message = error.response?.data?.error?.message || error.message;
            console.log(`❌ Failed (${status}): ${message}`);
        }
    }
    
    console.log('\n❌ All Gemini endpoints failed');
    console.log('💡 Solutions:');
    console.log('   1. Create NEW key at: https://aistudio.google.com/app/apikey');
    console.log('   2. Make sure "Generative Language API" is enabled');
    console.log('   3. Wait 2-3 minutes after creating new key\n');
    return false;
}

// ==================== TEST GROQ ====================
async function testGroq() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 TESTING GROQ AI');
    console.log('='.repeat(60));
    
    const apiKey = process.env.GROQ_API_KEY;
    
    console.log('🔑 API Key exists:', !!apiKey);
    console.log('🔑 API Key starts with:', apiKey?.substring(0, 10));
    console.log('🔑 API Key length:', apiKey?.length);
    
    if (!apiKey) {
        console.log('❌ GROQ_API_KEY not found in .env');
        console.log('💡 Get one at: https://console.groq.com/keys\n');
        return false;
    }
    
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    
    console.log('\n📡 Testing Groq endpoint...');
    
    try {
        const response = await axios.post(url, {
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'user',
                    content: "Say 'Hello! Groq is working!'"
                }
            ],
            temperature: 0.5,
            max_tokens: 50
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        const reply = response.data.choices[0].message.content;
        const model = response.data.model;
        
        console.log(`✅ SUCCESS! Reply: "${reply}"`);
        console.log(`✅ Model used: ${model}`);
        console.log(`✅ Groq is working perfectly!\n`);
        return true;
        
    } catch (error) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;
        console.log(`❌ Failed (${status}): ${message}`);
        
        if (status === 401) {
            console.log('💡 Invalid API key. Get new one at: https://console.groq.com/keys\n');
        }
        return false;
    }
}

// ==================== TEST PRODUCT CATEGORIZATION ====================
async function testProductCategorization(provider, apiKey) {
    console.log('\n' + '='.repeat(60));
    console.log(`🧪 TESTING PRODUCT CATEGORIZATION (${provider.toUpperCase()})`);
    console.log('='.repeat(60));
    
    const testProduct = {
        title: "Samsung Galaxy S23 5G (Cream, 8GB, 128GB Storage)",
        brand: "Samsung",
        category: "Smartphones"
    };
    
    console.log(`\n📱 Test Product: ${testProduct.title}`);
    console.log(`📡 Requesting categorization...\n`);
    
    try {
        if (provider === 'gemini') {
            const url = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=' + apiKey;
            
            const response = await axios.post(url, {
                contents: [{
                    parts: [{
                        text: `Analyze this product and return ONLY a JSON object (no markdown):
{
  "refined_category": "category",
  "subcategory": "subcategory",
  "tags": ["tag1", "tag2", "tag3"]
}

Product: ${testProduct.title}
Brand: ${testProduct.brand}
Category: ${testProduct.category}`
                    }]
                }]
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            });
            
            const text = response.data.candidates[0].content.parts[0].text;
            console.log('📄 Raw response:', text);
            
            const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                console.log('\n✅ Categorization Result:');
                console.log(`   Category: ${result.refined_category}`);
                console.log(`   Subcategory: ${result.subcategory}`);
                console.log(`   Tags: ${result.tags.join(', ')}\n`);
                return true;
            }
            
        } else if (provider === 'groq') {
            const url = 'https://api.groq.com/openai/v1/chat/completions';
            
            const response = await axios.post(url, {
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a product categorization expert. Return only valid JSON.'
                    },
                    {
                        role: 'user',
                        content: `Analyze and categorize this product. Return ONLY JSON:
{"refined_category": "Smartphones", "subcategory": "specific type", "tags": ["feature1", "feature2", "feature3"]}

Product: ${testProduct.title}
Brand: ${testProduct.brand}`
                    }
                ],
                temperature: 0.3,
                max_tokens: 200
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });
            
            const text = response.data.choices[0].message.content;
            console.log('📄 Raw response:', text);
            
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                console.log('\n✅ Categorization Result:');
                console.log(`   Category: ${result.refined_category}`);
                console.log(`   Subcategory: ${result.subcategory}`);
                console.log(`   Tags: ${result.tags.join(', ')}\n`);
                return true;
            }
        }
        
        console.log('❌ Failed to parse categorization result\n');
        return false;
        
    } catch (error) {
        console.log('❌ Categorization test failed:', error.message, '\n');
        return false;
    }
}

// ==================== MAIN TEST RUNNER ====================
async function runAllTests() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 AI PROVIDER TEST SUITE');
    console.log('='.repeat(60));
    
    const results = {
        gemini: false,
        groq: false
    };
    
    // Test Gemini
    const geminiEndpoint = await testGemini();
    if (geminiEndpoint) {
        results.gemini = true;
        await testProductCategorization('gemini', process.env.GEMINI_API_KEY);
    }
    
    // Test Groq
    const groqWorking = await testGroq();
    if (groqWorking) {
        results.groq = true;
        await testProductCategorization('groq', process.env.GROQ_API_KEY);
    }
    
    // Summary
    console.log('='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Gemini: ${results.gemini ? '✅ Working' : '❌ Not Working'}`);
    console.log(`Groq:   ${results.groq ? '✅ Working' : '❌ Not Working'}`);
    console.log('='.repeat(60));
    
    if (results.gemini) {
        console.log('\n✅ RECOMMENDED: Use Gemini (Google\'s official AI)');
        console.log('   - Free tier: 60 requests/minute');
        console.log('   - Run: node src/ai/process-products.js\n');
    } else if (results.groq) {
        console.log('\n✅ RECOMMENDED: Use Groq (Faster alternative)');
        console.log('   - Free tier: 30 requests/minute');
        console.log('   - Run: node src/ai/process-products-groq.js\n');
    } else {
        console.log('\n❌ No AI provider is working. Check API keys.\n');
    }
    
    process.exit(0);
}

runAllTests();