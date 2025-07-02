import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import Stripe from "stripe";

const app = express();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
});

const PORT = process.env.PORT || 10000;

const db = mysql.createPool({
  host: "localhost",         // Ersetze hier mit deinen echten DB-Daten
  user: "dein_mysql_user",
  password: "dein_mysql_passwort",
  database: "deine_datenbank",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Middleware für Stripe Webhook — rohen Body zur Signaturprüfung
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

app.use(cors());
app.use(express.json());

// Endpoint: Create Checkout Session
app.post("/create-checkout-session", async (req, res) => {
  const { checkin, checkout, guests } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",        // Passe an deine Währung an
            product_data: {
              name: "Hotelbuchung",
            },
            unit_amount: 10000,     // Beispiel: 100,00 USD (in Cent)
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: "https://deine-domain.com/success",
      cancel_url: "https://deine-domain.com/cancel",
      metadata: {
        checkin,
        checkout,
        guests,
      },
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error("Stripe Session Fehler:", error);
    res.status(500).json({ error: "Fehler beim Erstellen der Stripe-Session" });
  }
});

// Webhook Endpoint für Stripe
app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.log("Webhook Signaturprüfung fehlgeschlagen:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const checkin = session.metadata.checkin;
    const checkout = session.metadata.checkout;
    const guests = session.metadata.guests;

    try {
      await db.query(
        "INSERT INTO bookings (`from`, `to`, guests) VALUES (?, ?, ?)",
        [checkin, checkout, guests]
      );
      console.log(`Buchung gespeichert für Session ${session.id}`);
    } catch (error) {
      console.error("Fehler beim Speichern der Buchung:", error);
    }
  }

  res.json({ received: true });
});

app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));