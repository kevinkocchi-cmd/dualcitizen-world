const https = require('https');

function callAnthropic(apiKey, prompt) {
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1800, messages: [{ role: 'user', content: prompt }] });
    var opts = { hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) } };
    var req = https.request(opts, function(resp) {
      var data = '';
      resp.on('data', function(c) { data += c; });
      resp.on('end', function() {
        if (resp.statusCode !== 200) reject(new Error(resp.statusCode + ' ' + data));
        else try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('parse: ' + data.slice(0,100))); }
      });
    });
    req.on('error', function(e) { reject(e); });
    req.write(body); req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  var body = req.body || {};
  var ancestors = body.ancestors;
  if (!ancestors || !Array.isArray(ancestors) || ancestors.length === 0) return res.status(400).json({ error: 'No ancestors provided' });
  var results = [];
  for (var i = 0; i < Math.min(ancestors.length, 4); i++) {
    var anc = ancestors[i];
    var name = (anc.name || '').trim(), country = (anc.country || '').trim(), town = (anc.town || anc.birthplace || '').trim(), year = String(anc.year || anc.birthYear || '').trim(), relationship = (anc.relationship || '').trim();
    var prompt = 'You are an expert genealogist specializing in citizenship by descent research.\n\nResearch ancestor:\nName: ' + name + '\nCountry: ' + country + (town?'\nTown: '+town:'') + (year?'\nBirth year: '+year:'') + (relationship?'\nRelationship: '+relationship:'') + '\n\nRespond with ONLY raw JSON (no markdown):\n{"summary":"...","eligibilityNote":"...","criticalFlag":null,"recordTypes":["..."],"archives":[{"name":"...","description":"...","url":"https://...","searchTip":"..."}],"nextSteps":["Step 1: ..."],"recordAvailability":"high","recordAvailabilityReason":"..."}\nrecordAvailability must be high, medium, or low. Include 3-5 real archives for ' + country + '.';
    try {
      var msg = await callAnthropic(apiKey, prompt);
      var txt = (msg.content && msg.content[0] && msg.content[0].text) || '';
      txt = txt.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
      var parsed; try { parsed = JSON.parse(txt); } catch(e) { parsed = { summary:'Research for '+name, eligibilityNote:'Further research needed.', criticalFlag:null, recordTypes:['civil registration'], archives:[], nextSteps:['Locate records'], recordAvailability:'medium', recordAvailabilityReason:'Varies.' }; }
      results.push({ ancestor:{name,country,town,year,relationship}, research:parsed });
    } catch(e) { results.push({ ancestor:{name,country,town,year,relationship}, error:String(e.message||e) }); }
  }
  return res.status(200).json({ success:true, research:results });
};
