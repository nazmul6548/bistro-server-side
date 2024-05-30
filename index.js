const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASS:", process.env.DB_PASS);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ce00xrg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const foodCollection = client.db("bistroBossFood").collection("items");
    const userCollection = client.db("bistroBossFood").collection("users");
    const cartCollection = client.db("bistroBossFood").collection("carts");
    const paymentsCollection = client
      .db("bistroBossFood")
      .collection("payments");
    // const reviewCollection = client.db("bistroDb").collection("reviews");

    // jwt
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    // midlleweare
    const verifyToken = (req, res, next) => {
      console.log("verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Invalid authorization" });
      }
      const token = req.headers.authorization.split(" ")[1];
      //  if (!token) {

      //  }
      // next()

      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorize access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // users related api
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // usr related api
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    //

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const exUser = await userCollection.findOne(query);
      if (exUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid ID format" });
      }
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      if (result.deletedCount === 0) {
        return res.status(404).send({ error: "User not found" });
      }
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // post item
    app.post("/items", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await foodCollection.insertOne(item);
      res.send(result);
    });

    app.get("/items", async (req, res) => {
      const result = await foodCollection.find().toArray();
      res.send(result);
    });
    // cart collection

    app.get("/carts", async (req, res) => {
      const emailss = req.query.email;
      const query = { email: emailss };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });
    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });
    // app.get('/reviews', async(req, res) =>{
    //     const result = await reviewCollection.find().toArray();
    //     res.send(result);
    // })

    // payment
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      // if (!price || typeof price !== 'number') {
      //   return res.status(400).send({ error: 'Invalid or missing price' });
      // }

      const amount = parseInt(price * 100);
      console.log(amount, "amount inside");

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //
    app.get("/payments/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    });
    //

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentsCollection.insertOne(payment);
      console.log("payment info", payment);
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await cartCollection.deleteMany(query);
      res.send({ paymentResult, deleteResult });
    });

    // user have
    app.get("/admin-states",verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await foodCollection.estimatedDocumentCount();
      const orders = await paymentsCollection.estimatedDocumentCount();
      // const payments = await paymentsCollection.find().toArray();
      // const revenue = payments.reduce(
      //   (total, payment) => total + payment.price,
      //   0
      // );
      const result = await paymentsCollection.aggregate([
        {
          $group:{
            _id:null,
            totalRevenue:{
              $sum:'$price'
            }
          }
        }
      ]).toArray()
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        menuItems,
        orders,
        revenue,
      });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("boss is sitting");
});

app.listen(port, () => {
  console.log(`Bistro boss is sitting on port ${port}`);
});
