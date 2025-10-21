#!/usr/bin/env node

// Script de test pour vérifier l'API
const API_BASE = process.env.API_BASE || 'http://localhost:4000';

async function testApi() {
  console.log('🧪 Test de l\'API Nova Stream...\n');

  try {
    // Test de santé
    console.log('1. Test de santé de l\'API...');
    const healthResponse = await fetch(`${API_BASE}/health`);
    if (healthResponse.ok) {
      console.log('✅ API en ligne');
    } else {
      console.log('❌ API hors ligne');
      return;
    }

    // Test d'authentification
    console.log('\n2. Test d\'authentification...');
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'testpassword'
      })
    });

    if (loginResponse.status === 401) {
      console.log('ℹ️  Création d\'un compte de test...');
      const signupResponse = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'testpassword'
        })
      });

      if (signupResponse.ok) {
        console.log('✅ Compte de test créé');
      } else {
        console.log('❌ Erreur lors de la création du compte');
        return;
      }
    }

    // Récupération des cookies
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('✅ Authentification réussie');

    // Test des endpoints Xtream (sans credentials Xtream)
    console.log('\n3. Test des endpoints Xtream...');
    const xtreamResponse = await fetch(`${API_BASE}/api/xtream/movies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies || ''
      }
    });

    console.log(`Status: ${xtreamResponse.status}`);
    if (xtreamResponse.status === 404) {
      console.log('✅ Endpoint accessible (pas de credentials Xtream)');
    } else if (xtreamResponse.status === 403) {
      console.log('⚠️  Erreur 403 - problème d\'authentification');
    } else {
      console.log('ℹ️  Réponse inattendue');
    }

    console.log('\n🎉 Tests terminés');

  } catch (error) {
    console.error('❌ Erreur lors des tests:', error.message);
  }
}

testApi();