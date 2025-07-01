const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Stripe-Key via Environment-Variable

const app = express();
const PORT = process.env.PORT || 4242;
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');

// 🔐 CORS: Nur deine echte Domain erlauben
app.use(cors({
  origin: 'https://www.olympspa.ch', // <== ✏️ Hier ggf. deine Swizzonic-Domain anpassen
}));

app.use(express.json());
app.use(express.static('public')); // Für success.html etc.

// 📥 POST: Neue Buchung speichern
app.post('/bookings', (req, res) => {
  const { from, to, guests } = req.body;

  if (!from || !to || !guests) {
    return res.status(400).json({ error: "Fehlende Buchungsdaten" });
  }

  if (new Date(from) >= new Date(to)) {
    return res.status(400).json({ error: "Ungültiger Zeitraum (from >= to)" });
  }

  try {
    let bookings = [];
    if (fs.existsSync(BOOKINGS_FILE)) {
      bookings = JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf-8'));
    }

    const overlap = bookings.some(b =>
      !(new Date(to) <= new Date(b.from) || new Date(from) >= new Date(b.to))
    );

    if (overlap) {
      return res.status(409).json({ error: "Zeitraum bereits gebucht" });
    }

    bookings.push({ from, to, guests });
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
    res.status(201).json({ message: "Buchung gespeichert" });
  } catch (err) {
    console.error('Fehler beim Speichern:', err);
    res.status(500).json({ error: 'Serverfehler beim Speichern' });
  }
});

// 📂 GET: Alle Buchungen auslesen
app.get('/bookings', (req, res) => {
  try {
    if (!fs.existsSync(BOOKINGS_FILE)) return res.json([]);
    const data = fs.readFileSync(BOOKINGS_FILE, 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    console.error('Fehler beim Laden der Buchungen:', err);
    res.status(500).json([]);
  }
});

// 💳 POST: Stripe Checkout Session erstellen
app.post('/create-checkout-session', async (req, res) => {
  const { checkin, checkout, guests } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Reserva (${guests} pessoa${guests > 1 ? 's' : ''})`,
            description: `Check-in: ${checkin}, Check-out: ${checkout}`
          },
          unit_amount: 15000 // z. B. 150,00 R$
        },
        quantity: 1
      }],
      success_url: 'https://olympspa.onrender.com/success.html', // ✅ Neue Render-URL
      cancel_url: 'https://olympspa.onrender.com/cancel.html'
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error('Stripe-Fehler:', err);
    res.status(500).json({ error: 'Stripe Session konnte nicht erstellt werden' });
  }
});

// 🚀 Server starten
app.listen(PORT, () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});