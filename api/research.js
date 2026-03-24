const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { ancestors, userName } = req.body || {};
  if (!ancestors || !Array.isArray(ancestors) || ancestors.length === 0) {
    return res.status(400).json({ error: 'No ancestors provided' });
  }

  const client = new Anthropic({ apiKey });
  const results = [];

  const ancList = ancestors.slice(0, 4);

  for (var i = 0; i < ancList.length; i++) {
    var anc = ancList[i];
    var name = (anc.name || '').trim();
    var country = (anc.country || '').trim();
    var town = (anc.town || anc.birthplace || '').trim();
    var year = String(anc.year || anc.birthYear || '').trim();
    var relationship = (anc.relationship || '').trim();

    var nameParts = name.split(' ');
    var firstName = nameParts[0] || '';
    var lastName = nameParts[nameParts.length - 1] || '';

    var prompt = 'You are an expert genealogist specializing in European and international immigration records, vital records, and citizenship by descent research.\n\n' +
      'Research the following ancestor for citizenship by descent purposes:\n' +
      'Name: ' + name + '\n' +
      'Country of origin: ' + country + '\n' +
      (town ? 'Town/village: ' + town + '\n' : '') +
      (year ? 'Approximate birth year: ' + year + '\n' : '') +
      (relationship ? 'Relationship to applicant: ' + relationship + '\n' : '') +
      '\nProvide a JSON response (no markdown, just raw JSON) with exactly this structure:\n' +
      '{\n' +
      '  "summary": "2-3 sentence research summary specific to this ancestor and country",\n' +
      '  "eligibilityNote": "brief assessment of citizenship claim strength based on lineage and dates",\n' +
      '  "criticalFlag": "most important issue to resolve, or null if no critical issues",\n' +
      '  "recordTypes": ["list", "of", "record", "types", "to", "search"],\n' +
      '  "archives": [\n' +
      '    {"name": "archive name", "description": "what records they hold", "url": "https://...", "searchTip": "specific search advice"}\n' +
      '  ],\n' +
      '  "nextSteps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],\n' +
      '  "recordAvailability": "high",\n' +
      '  "recordAvailabilityReason": "brief reason why records are available or limited"\n' +
      '}\n\n' +
      'Include 3-5 real, verified archives/databases with working URLs. Focus on official national archives, civil registry offices, and reputable genealogy databases for ' + country + '.\n' +
      'The recordAvailability field must be exactly one of: "high", "medium", or "low".\n' +
      'Return ONLY valid JSON, no other text.';

    try {
      var message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1800,
        messages: [{ role: 'user', content: prompt }]
      });

      var rawText = '';
      if (message.content && message.content.length > 0) {
        rawText = message.content[0].text || '';
      }

      // Strip markdown code blocks if present
      rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

      var parsed = null;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        parsed = {
          summary: 'Research completed for ' + name + ' from ' + country + '.',
          eligibilityNote: 'Further research needed to assess eligibility.',
          criticalFlag: null,
          recordTypes: ['civil registration', 'parish records', 'immigration records'],
          archives: [],
          nextSteps: ['Locate birth certificate', 'Research immigration records', 'Consult genealogist'],
          recordAvailability: 'medium',
          recordAvailabilityReason: 'Records availability varies by region and time period.'
        };
      }

      results.push({
        ancestor: { name: name, country: country, town: town, year: year, relationship: relationship },
        research: parsed
      });
    } catch (apiErr) {
      results.push({
        ancestor: { name: name, country: country, town: town, year: year, relationship: relationship },
        error: apiErr.message || 'Research failed'
      });
    }
  }

  return res.status(200).json({ success: true, research: results });
};
