import express from "express";
import cors from "cors";
import fs from "fs";
import Stripe from "stripe";

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
});

const PORT = process.env.PORT; // Kein Fallback!

app.use(cors());
app.use(express.json());

const BOOKINGS_FILE = "./bookings.json";

// Test-Route
app.get("/", (req, res) => {
  res.send("API läuft ✅");
});

function loadBookings() {
  if (!fs.existsSync(BOOKINGS_FILE)) return [];
  const data = fs.readFileSync(BOOKINGS_FILE);
  return JSON.parse(data);
}

function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

// Alle Buchungen abrufen
app.get("/bookings", (req, res) => {
  const bookings = loadBookings();
  res.json(bookings);
});

// Neue Buchung speichern
app.post("/bookings", (req, res) => {
  const { from, to, guests } = req.body;
  if (!from || !to || !guests) return res.status(400).json({ error: "Missing data" });

  const bookings = loadBookings();
  const isOverlap = bookings.some(b => !(to <= b.from || from >= b.to));
  if (isOverlap) return res.status(409).json({ error: "Period already booked" });

  bookings.push({ from, to, guests });
  saveBookings(bookings);

  res.status(201).json({ message: "Booking saved" });
});

// Stripe Checkout Session erstellen
app.post("/create-checkout-session", async (req, res) => {
  console.log("🔑 Stripe Key beim Start:", process.env.STRIPE_SECRET_KEY);

  const { checkin, checkout, guests } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: "Olymp Spa Booking" },
          unit_amount: 15000,
        },
        quantity: 1,
      }],
      success_url: "https://www.olympspa.com/success.html",
      cancel_url: "https://www.olympspa.com/cancel.html",
      metadata: { checkin, checkout, guests },
    });

    res.json({ id: session.id });

  } catch (error) {
    console.error("❌ Stripe Session Creation Failed:");
    console.error(error);

    res.status(500).json({
      error: "Stripe session creation failed",
      message: error.message,
      type: error.type || null,
      raw: error.raw || null,
    });
  }
});

// Server starten
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));