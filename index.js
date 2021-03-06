const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();
const port = process.env.PORT || 8080;

//middleware
app.use(express.json());
app.use(cors());
const corsConfig = {
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
  app.use(cors(corsConfig))
  app.options("*", cors(corsConfig))
  app.use(express.json())
  app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept,authorization")
  next()
  })

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pxjyc.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyToken = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) {
    return res.send({ message: "Unauthorized access" });
  }
  const token = auth.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();

    const usersCollection = client.db("productsCollection").collection("user");
    const productsCollection = client.db("productsCollection").collection("products");
    const ordersCollection = client.db("productsCollection").collection("orders");
    const reviewsCollection = client.db("productsCollection").collection("reviews");
    const paymentsCollection = client.db("productsCollection").collection("payments")
    const newsCollection = client.db("productsCollection").collection("news");

    const verifyAdmin = async (req, res, next) => {
      const user = req.decoded.email;
      const requester = await usersCollection.findOne({ email: user });
      if (requester.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "Forbidden" });
      }
    };

    // GET ALL PRODUCTS AND BASED ON QUERY
    app.get("/products", verifyToken, async (req, res) => {
      let query;
      if (req.query.email) {
        const email = req.query.email;
        const decodedEmail = req.decoded.email;
        if (email === decodedEmail) {
          const query = { email: email };
          const result = await todosCollection.find(query).toArray();
          res.send(result);
        } else {
          return res.send({ message: "Forbidden access" });
        }
      } else {
        query = {};
        const cursor = await productsCollection.find(query).toArray();
        res.send(cursor);
      }
    });

    // CREATE PAYMENT INTENT
    app.post("/create-payment-intent", async (req, res) => {
      const service = req.body;
      const price = service?.totalPrice;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // GET PRODUCTS FOR HOME PAGE TOOLS SECTION
    app.get("/tools", async (req, res) => {
      const query = {};
      const cursor = await productsCollection.find(query).toArray();
      res.send(cursor);
    });

    // GET NEWS
    app.get("/news", async (req, res) => {
      const cursor = await newsCollection.find({}).toArray();
      res.send(cursor);
    });

    // GET ALL USER INFO (ONLY ADMIN)
    app.get("/user", verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.send(users);
    });

    // GET USER BASED ON EMAIL
    app.get("/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const users = await usersCollection.findOne(query);
      res.send(users);
    });

    // GET PRODUCTS BASED ON ID
    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const cursor = await productsCollection.findOne(query);
      res.send(cursor);
    });

    // CHECK A USER IS ADMIN OR NOT
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    // GET ALL REVIEWS
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find({}).toArray();
      res.send(result);
    });

    // GET ALL ORDERS
    app.get("/orders", verifyToken, async (req, res) => {
      if (req.query.email) {
        const email = req.query.email;
        const filter = { customerEmail: email };
        const result = await ordersCollection.find(filter).toArray();
        res.send(result);
      } else {
        const result = await ordersCollection.find({}).toArray();
        res.send(result);
      }
    });

    // GET ORDERS BASED ON ID
    app.get("/orders/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await ordersCollection.findOne(query);
      res.send(result);
    });

    // POST A NEW ORDER TO DATABASE
    app.post("/orders", async (req, res) => {
      const order = req.body;
      const query = { name: order.name, customer: order.customer };
      const findDuplicate = await ordersCollection.findOne(query);
      if (findDuplicate) {
        res.send({ message: "already purchased" });
      } else {
        const result = await ordersCollection.insertOne(order);
        res.send(result);
      }
    });

    // POST A NEW REVIEW
    app.post("/reviews", async (req, res) => {
      const testimonial = req.body;
      const result = await reviewsCollection.insertOne(testimonial);
      res.send(result);
    });

    // POST A NEW PRODUCT
    app.post("/products", verifyToken, verifyAdmin, async (req, res) => {
      const product = req.body;
      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    // SET PAID STATUS AND TRANSACTION ID TO PAID PRODUCTS
    app.put("/orders/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const doc = {
        $set: { 
          status: 'pending',
          transactionId: payment.transactionId
         },
      };
      const result = await paymentsCollection.insertOne(payment);
      const updatedOrder = await ordersCollection.updateOne(filter, doc);
      res.send(updatedOrder);
    });

    app.put("/orders/status/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: payment.status
        }
      }
      const updatedStatus = await ordersCollection.updateOne(filter, updatedDoc);
      res.send(updatedStatus);
    })

    // CREATE NEW ADMIN
    app.put(
      "/user/admin/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };
        const updateAdmin = {
          $set: { role: "admin" },
        };
        const result = await usersCollection.updateOne(filter, updateAdmin);
        res.send(result);
      }
    );

    // UPDATE QUANTITY OF PURCHASED PRODUCTS
    app.put("/products/:id", async (req, res) => {
      const id = req.params.id;
      const { newQuantity } = req.body;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const doc = {
        $set: {
          quantity: newQuantity,
        },
      };
      const result = await productsCollection.updateOne(filter, doc, options);
      res.send(result);
    });

    // PUT AUTHORIZED USER
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateUser = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateUser,
        options
      );
      const accessToken = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET
      );
      res.send({ result, token: accessToken });
    });

    // UPDATE USER PROFILE
    app.put("/user/update/:email", async (req, res) => {
      const email = req.params.email;
      const userInfo = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateUser = {
        $set: userInfo,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateUser,
        options
      );
      res.send(result);
    });

    // DELETE A PRODUCT BASED ON ID FROM PRODUCT LIST
    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      if (result.deletedCount === 1) {
        res.status(200).send({message: "Successfully Deleted One document"});
      } else {
        res.status(404).send({message: "Something Went Wrong"});
      }
    });

    // DELETE A PRODUCT BASED ON ID FROM ORDER LIST

    app.delete("/order/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await ordersCollection.deleteOne(query);
      if (result.deletedCount === 1) {
        res.status(200).send({message: "Successfully Deleted One document"});
      } else {
        res.status(404).send({message: "Something Went Wrong"});
      }
    });

  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send(`
  <h1>Server Is Running <a href="https://facebook.com">Visit</a></h1>
  `);
});

app.listen(port, () => {
  console.log(`server is running at http://localhost:${port}`);
});
