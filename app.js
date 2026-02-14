// CleanSheet Web App - Main JavaScript

// Configuration
const FPL_API_BASE = 'https://fantasy.premierleague.com/api/';
const CORS_PROXY = 'https://api.allorigins.win/raw?url='; // CORS proxy fallback
const BOOTSTRAP_URL = FPL_API_BASE + 'bootstrap-static/';
const TEAM_URL = (teamId) => FPL_API_BASE + `entry/${teamId}/`;
const FIXTURES_URL = FPL_API_BASE + 'fixtures/';

// Try direct first, fall back to CORS proxy
let useCorsProxy = false;

// Default team ratings (can be customized)
const DEFAULT_TEAM_RATINGS = {
    // These will be populated from FPL strength data
    // Higher = harder opponent
};

// Home/Away modifiers
const HOME_MODIFIER = -1;
const AWAY_MODIFIER = 1;

// Global state
let bootstrapData = null;
let currentGW = null;
let fixturesData = null;
let teamRatings = {};
let userTeamId = null;

// Initialize on page load
window.addEventListener('DOMContentLoaded', init);

// Helper function to fetch with CORS proxy fallback
async function fetchWithCors(url) {
    try {
        // Try direct fetch first
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.log('Direct fetch failed, trying CORS proxy...', error);
        
        // Fall back to CORS proxy
        try {
            const proxiedUrl = CORS_PROXY + encodeURIComponent(url);
            const response = await fetch(proxiedUrl);
            if (!response.ok) {
                throw new Error(`Proxy HTTP ${response.status}`);
            }
            return await response.json();
        } catch (proxyError) {
            console.error('Both direct and proxy fetch failed:', proxyError);
            throw new Error('Unable to fetch FPL data. The API may be down or blocking requests.');
        }
    }
}

async function init() {
    // Check for team ID in URL or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const urlTeamId = urlParams.get('team');
    const storedTeamId = localStorage.getItem('fpl_team_id');
    
    userTeamId = urlTeamId || storedTeamId;
    
    // Load initial data
    await refreshData();
    
    // Show team ID prompt if scrolled down
    window.addEventListener('scroll', handleScroll);
}

function handleScroll() {
    const prompt = document.getElementById('teamIdPrompt');
    if (window.scrollY > 300 && !userTeamId) {
        prompt.classList.remove('hidden');
    }
}

async function refreshData() {
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳ Loading...';
    
    try {
        console.log('Fetching FPL data...');
        
        // Fetch bootstrap data with CORS fallback
        bootstrapData = await fetchWithCors(BOOTSTRAP_URL);
        console.log('Bootstrap data loaded successfully');
        
        currentGW = getCurrentGameweek(bootstrapData);
        
        // Update current GW display
        document.getElementById('gwNumber').textContent = currentGW;
        document.getElementById('currentGW').classList.remove('hidden');
        
        // Initialize team ratings from FPL data
        initializeTeamRatings(bootstrapData);
        
        // Fetch fixtures with CORS fallback
        fixturesData = await fetchWithCors(FIXTURES_URL);
        console.log('Fixtures data loaded successfully');
        
        // Render fixtures table
        renderFixturesTable();
        
        // If user has team ID, load their team
        if (userTeamId) {
            await loadMyTeam();
        } else {
            // Show team ID prompt
            document.getElementById('teamIdPrompt').classList.remove('hidden');
        }
        
    } catch (error) {
        console.error('Error loading data:', error);
        
        // More helpful error message
        let errorMsg = 'Failed to load FPL data. ';
        if (error.message.includes('API may be down')) {
            errorMsg += 'The FPL API may be temporarily down or blocking requests from this domain. ';
        } else {
            errorMsg += error.message + ' ';
        }
        errorMsg += '\n\nPlease try again in a few seconds, or check if fantasy.premierleague.com is accessible.';
        
        alert(errorMsg);
        
        // Show error in the loading area
        document.getElementById('fixturesLoading').innerHTML = `
            <p style="color: red;">❌ Error loading data</p>
            <p style="font-size: 0.9rem; color: var(--secondary-text);">
                The FPL API may be temporarily down or blocking requests.<br>
                <button onclick="refreshData()" style="margin-top: 16px; padding: 10px 20px; background: var(--header-bg); color: white; border: none; border-radius: 6px; cursor: pointer;">
                    Try Again
                </button>
            </p>
        `;
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Refresh';
    }
}

function getCurrentGameweek(data) {
    const events = data.events;
    for (let event of events) {
        if (event.is_current) return event.id;
    }
    for (let event of events) {
        if (event.is_next) return event.id;
    }
    return 1;
}

function initializeTeamRatings(data) {
    const teams = data.teams;
    
    // Find min and max strength for normalization
    const strengths = teams.map(t => (t.strength_overall_home + t.strength_overall_away) / 2);
    const minStrength = Math.min(...strengths);
    const maxStrength = Math.max(...strengths);
    
    teams.forEach(team => {
        const avgStrength = (team.strength_overall_home + team.strength_overall_away) / 2;
        
        // Normalize to 1-10 scale
        const difficulty = 1 + ((avgStrength - minStrength) / (maxStrength - minStrength)) * 9;
        
        teamRatings[team.id] = {
            name: team.name,
            short_name: team.short_name,
            difficulty: Math.round(difficulty),
            strength: Math.round(avgStrength)
        };
    });
}

function calculateFixtureDifficulty(opponentId, isHome) {
    const opponent = teamRatings[opponentId];
    if (!opponent) return 5;
    
    const modifier = isHome ? HOME_MODIFIER : AWAY_MODIFIER;
    const finalDifficulty = opponent.difficulty + modifier;
    
    return Math.max(1, Math.min(10, finalDifficulty));
}

function getDifficultyClass(difficulty) {
    if (difficulty <= 2) return 'diff-1-2';
    if (difficulty === 3) return 'diff-3';
    if (difficulty === 4 || difficulty === 5) return 'diff-4-5';
    if (difficulty === 6) return 'diff-6';
    if (difficulty === 7 || difficulty === 8) return 'diff-7-8';
    if (difficulty === 9) return 'diff-9';
    return 'diff-10';
}

function getStrengthColor(strength) {
    // Map strength to difficulty color for consistency
    if (strength >= 90) return 'var(--diff-1-2)';
    if (strength >= 80) return 'var(--diff-3)';
    if (strength >= 70) return 'var(--diff-4-5)';
    if (strength >= 60) return 'var(--diff-6)';
    if (strength >= 50) return 'var(--diff-7-8)';
    if (strength >= 40) return 'var(--diff-9)';
    return 'var(--diff-10)';
}

function renderFixturesTable() {
    const teams = bootstrapData.teams.sort((a, b) => a.name.localeCompare(b.name));
    
    // Build fixture map
    const fixtureMap = buildFixtureMap();
    
    // Determine how many GWs to show (responsive)
    const isMobile = window.innerWidth < 768;
    const numGWs = isMobile ? 4 : 8;
    
    // Render header
    const headerRow = document.getElementById('fixturesHeader');
    let headerHTML = '<tr><th class="team-col">Team</th><th class="strength-col">Strength</th>';
    for (let i = 0; i < numGWs; i++) {
        headerHTML += `<th class="fixture-col">GW${currentGW + i}</th>`;
    }
    headerHTML += '</tr>';
    headerRow.innerHTML = headerHTML;
    
    // Render rows
    const tbody = document.getElementById('fixturesBody');
    let bodyHTML = '';
    
    teams.forEach(team => {
        const rating = teamRatings[team.id];
        const strengthColor = getStrengthColor(rating.strength);
        
        bodyHTML += `<tr>
            <td><strong>${team.short_name}</strong></td>
            <td style="text-align: center;">
                <span class="strength-indicator">
                    <span class="strength-dot" style="background: ${strengthColor};"></span>
                    ${rating.strength}
                </span>
            </td>`;
        
        for (let i = 0; i < numGWs; i++) {
            const gw = currentGW + i;
            const fixtures = fixtureMap[team.id][gw] || [];
            
            if (fixtures.length === 0) {
                bodyHTML += '<td><div class="fixture-cell blank">—</div></td>';
            } else if (fixtures.length === 1) {
                const fixture = fixtures[0];
                const oppTeam = teamRatings[fixture.opponent];
                const diffClass = getDifficultyClass(fixture.difficulty);
                const prefix = fixture.isHome ? '' : '@';
                bodyHTML += `<td><div class="fixture-cell ${diffClass}">${prefix}${oppTeam.short_name}</div></td>`;
            } else {
                // Double gameweek
                const avgDiff = Math.round(fixtures.reduce((sum, f) => sum + f.difficulty, 0) / fixtures.length);
                const diffClass = getDifficultyClass(avgDiff);
                const fixtureText = fixtures.map(f => {
                    const oppTeam = teamRatings[f.opponent];
                    const prefix = f.isHome ? '' : '@';
                    return `${prefix}${oppTeam.short_name}`;
                }).join('<br>');
                bodyHTML += `<td><div class="fixture-cell ${diffClass}">${fixtureText}</div></td>`;
            }
        }
        
        bodyHTML += '</tr>';
    });
    
    tbody.innerHTML = bodyHTML;
    
    // Hide loading, show table
    document.getElementById('fixturesLoading').classList.add('hidden');
    document.getElementById('fixturesTable').classList.remove('hidden');
}

function buildFixtureMap() {
    const fixtureMap = {};
    
    // Initialize
    Object.keys(teamRatings).forEach(teamId => {
        fixtureMap[teamId] = {};
    });
    
    // Populate
    fixturesData.forEach(fixture => {
        if (fixture.event >= currentGW && fixture.event < currentGW + 8) {
            const gw = fixture.event;
            
            // Home team
            if (!fixtureMap[fixture.team_h][gw]) {
                fixtureMap[fixture.team_h][gw] = [];
            }
            fixtureMap[fixture.team_h][gw].push({
                opponent: fixture.team_a,
                isHome: true,
                difficulty: calculateFixtureDifficulty(fixture.team_a, true)
            });
            
            // Away team
            if (!fixtureMap[fixture.team_a][gw]) {
                fixtureMap[fixture.team_a][gw] = [];
            }
            fixtureMap[fixture.team_a][gw].push({
                opponent: fixture.team_h,
                isHome: false,
                difficulty: calculateFixtureDifficulty(fixture.team_h, false)
            });
        }
    });
    
    return fixtureMap;
}

async function loadMyTeam() {
    // Get team ID from input or stored
    const input = document.getElementById('teamIdInput');
    if (input.value) {
        userTeamId = input.value;
        localStorage.setItem('fpl_team_id', userTeamId);
        
        // Update URL without reload
        const url = new URL(window.location);
        url.searchParams.set('team', userTeamId);
        window.history.pushState({}, '', url);
    }
    
    if (!userTeamId) {
        alert('Please enter your Team ID');
        return;
    }
    
    // Show team section
    document.getElementById('myTeamSection').classList.remove('hidden');
    document.getElementById('myTeamLoading').classList.remove('hidden');
    document.getElementById('myTeamTable').classList.add('hidden');
    document.getElementById('teamIdPrompt').classList.add('hidden');
    
    try {
        console.log('Fetching team data for ID:', userTeamId);
        
        // Fetch team data with CORS fallback
        const teamData = await fetchWithCors(TEAM_URL(userTeamId));
        
        // Fetch current picks with CORS fallback
        const picksData = await fetchWithCors(TEAM_URL(userTeamId) + `event/${currentGW}/picks/`);
        
        console.log('Team data loaded successfully');
        
        // Render team table
        renderTeamTable(picksData.picks);
        
    } catch (error) {
        console.error('Error loading team:', error);
        
        let errorMsg = 'Failed to load team. ';
        if (error.message.includes('404')) {
            errorMsg += 'Team ID not found. Please check your ID and try again.';
        } else if (error.message.includes('API may be down')) {
            errorMsg += 'The FPL API may be temporarily down.';
        } else {
            errorMsg += 'Please check your Team ID and try again.';
        }
        
        alert(errorMsg);
        document.getElementById('myTeamLoading').classList.add('hidden');
        
        // Show error message
        document.getElementById('myTeamLoading').innerHTML = `
            <p style="color: red;">❌ Error loading team</p>
            <p style="font-size: 0.9rem; color: var(--secondary-text);">
                ${errorMsg}<br>
                <button onclick="loadMyTeam()" style="margin-top: 16px; padding: 10px 20px; background: var(--header-bg); color: white; border: none; border-radius: 6px; cursor: pointer;">
                    Try Again
                </button>
            </p>
        `;
        document.getElementById('myTeamLoading').classList.remove('hidden');
    }
}

function renderTeamTable(picks) {
    const players = bootstrapData.elements;
    const teams = bootstrapData.teams;
    
    const playerMap = {};
    players.forEach(p => playerMap[p.id] = p);
    
    const teamMap = {};
    teams.forEach(t => teamMap[t.id] = t);
    
    const fixtureMap = buildFixtureMap();
    
    // Determine how many GWs to show
    const isMobile = window.innerWidth < 768;
    const numGWs = isMobile ? 4 : 8;
    
    // Build team array
    const teamArray = picks.map(pick => {
        const player = playerMap[pick.element];
        if (!player) return null;
        
        const team = teamMap[player.team];
        const position = getPositionShort(player.element_type);
        
        return {
            name: player.web_name,
            position: position,
            team: team.short_name,
            teamId: player.team,
            price: (player.now_cost / 10).toFixed(1),
            form: parseFloat(player.form || 0).toFixed(1),
            priceChange: getPriceChangeDisplay(player),
            news: player.news || '—'
        };
    }).filter(p => p !== null);
    
    // Sort by position
    const posOrder = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
    teamArray.sort((a, b) => posOrder[a.position] - posOrder[b.position]);
    
    // Render header
    const headerRow = document.getElementById('teamHeader');
    let headerHTML = '<tr><th>Player</th><th>Pos</th><th>Team</th><th>£</th><th>Form</th><th>Δ</th><th>News</th>';
    for (let i = 0; i < numGWs; i++) {
        headerHTML += `<th class="fixture-col">GW${currentGW + i}</th>`;
    }
    headerHTML += '</tr>';
    headerRow.innerHTML = headerHTML;
    
    // Render rows
    const tbody = document.getElementById('teamBody');
    let bodyHTML = '';
    
    teamArray.forEach(player => {
        bodyHTML += `<tr>
            <td><strong>${player.name}</strong></td>
            <td><span class="position-badge pos-${player.position.toLowerCase()}">${player.position}</span></td>
            <td>${player.team}</td>
            <td>${player.price}</td>
            <td>${player.form}</td>
            <td>${player.priceChange}</td>
            <td style="font-size: 0.75rem; color: var(--secondary-text);">${player.news}</td>`;
        
        for (let i = 0; i < numGWs; i++) {
            const gw = currentGW + i;
            const fixtures = fixtureMap[player.teamId][gw] || [];
            
            if (fixtures.length === 0) {
                bodyHTML += '<td><div class="fixture-cell blank">—</div></td>';
            } else if (fixtures.length === 1) {
                const fixture = fixtures[0];
                const oppTeam = teamRatings[fixture.opponent];
                const diffClass = getDifficultyClass(fixture.difficulty);
                const prefix = fixture.isHome ? '' : '@';
                bodyHTML += `<td><div class="fixture-cell ${diffClass}">${prefix}${oppTeam.short_name}</div></td>`;
            } else {
                // Double gameweek
                const avgDiff = Math.round(fixtures.reduce((sum, f) => sum + f.difficulty, 0) / fixtures.length);
                const diffClass = getDifficultyClass(avgDiff);
                const fixtureText = fixtures.map(f => {
                    const oppTeam = teamRatings[f.opponent];
                    const prefix = f.isHome ? '' : '@';
                    return `${prefix}${oppTeam.short_name}`;
                }).join('<br>');
                bodyHTML += `<td><div class="fixture-cell ${diffClass}">${fixtureText}</div></td>`;
            }
        }
        
        bodyHTML += '</tr>';
    });
    
    tbody.innerHTML = bodyHTML;
    
    // Hide loading, show table
    document.getElementById('myTeamLoading').classList.add('hidden');
    document.getElementById('myTeamTable').classList.remove('hidden');
}

function getPositionShort(elementType) {
    const positions = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
    return positions[elementType] || 'UNK';
}

function getPriceChangeDisplay(player) {
    const recentChange = player.cost_change_event || 0;
    
    if (recentChange > 0) return '↑';
    if (recentChange < 0) return '↓';
    
    const transfersIn = player.transfers_in_event || 0;
    const transfersOut = player.transfers_out_event || 0;
    const netTransfers = transfersIn - transfersOut;
    
    if (netTransfers > 50000) return '↗';
    if (netTransfers < -50000) return '↘';
    
    return '—';
}

// Handle window resize
window.addEventListener('resize', () => {
    if (bootstrapData) {
        renderFixturesTable();
        if (userTeamId) {
            // Re-render team table with new column count
            loadMyTeam();
        }
    }
});
