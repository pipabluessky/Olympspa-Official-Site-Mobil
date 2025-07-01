import express from "express";
import cors from "cors";
import fs from "fs";
import Stripe from "stripe";

const app = express();
const stripe = new Stripe("sk_test_dein_stripe_secret_key", { apiVersion: "2022-11-15" });

const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const BOOKINGS_FILE = "./bookings.json";

function loadBookings() {
  if (!fs.existsSync(BOOKINGS_FILE)) return [];
  const data = fs.readFileSync(BOOKINGS_FILE);
  return JSON.parse(data);
}

function saveBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

// Get all bookings
app.get("/bookings", (req, res) => {
  const bookings = loadBookings();
  res.json(bookings);
});

// Create booking
app.post("/bookings", (req, res) => {
  const { from, to, guests } = req.body;
  if (!from || !to || !guests) return res.status(400).json({ error: "Missing data" });

  const bookings = loadBookings();

  // Check overlap
  const isOverlap = bookings.some(b => !(to <= b.from || from >= b.to));
  if (isOverlap) return res.status(409).json({ error: "Period already booked" });

  bookings.push({ from, to, guests });
  saveBookings(bookings);

  res.status(201).json({ message: "Booking saved" });
});

// Create Stripe checkout session
app.post("/create-checkout-session", async (req, res) => {
  const { checkin, checkout, guests } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: "Olymp Spa Booking",
          },
          unit_amount: 15000, // $150.00 Beispielpreis
        },
        quantity: 1,
      }],
      success_url: "https://www.olympspa.com/success.html",
      cancel_url: "https://www.olympspa.com/cancel.html",
      metadata: { checkin, checkout, guests }
    });
    res.json({ id: session.id });
  } catch (error) {
    console.error("Stripe Error:", error);
    res.status(500).json({ error: "Stripe session creation failed" });
  }
});

app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));