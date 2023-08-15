const express = require("express");
const bodyParser = require("body-parser");
const { MongoClient, ObjectId } = require("mongodb");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const cors = require('cors');

const env = require("dotenv").config();
const util = require('util');
const amqp = require('amqplib/callback_api');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const app = express();
app.use(bodyParser.json());

app.use(cors());


// MongoDB connection string
const uri = "mongodb+srv://Rok:Feri123!@cluster0.bkl6gj5.mongodb.net/product";

// Database and collection names
const dbName = "productsDB";
const collectionName = "products";

const authorize = require('./middleware/authorization')

// RabbitMQ connection details
const rabbitUser = "student";
const rabbitPassword = "student123";
const rabbitHost = "studentdocker.informatika.uni-mb.si";
// const rabbitHost = "rabbit";
const rabbitPort = "5672";
const vhost = "";
const amqpUrl = util.format("amqp://%s:%s@%s:%s/%s", rabbitUser, rabbitPassword, rabbitHost, rabbitPort, vhost);

// RabbitMQ Exchange, Queue, and Routing key
const exchange = 'upp-3';
const queue = 'upp-3';
const routingKey = 'zelovarnikey';

const jwtAuth = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Missing Authorization header' });
      }
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.SECRET_KEY);
      req.user = decoded;
      next();
    } catch (err) {
      console.error('Error verifying token:', err.message);
      return res.status(403).json({ error: 'Invalid token' });
    }
  };

function publishLog(log) {
    amqp.connect(amqpUrl, { heartbeat: 60 }, (error, connection) => {
        if (error) {
            console.error("Error connecting to RabbitMQ:", error);
            return;
        }
        connection.createChannel((error, channel) => {
            if (error) {
                console.error("Error creating RabbitMQ channel:", error);
                return;
            }

            channel.assertExchange(exchange, 'direct', { durable: true });
            channel.assertQueue(queue, { durable: true });
            channel.bindQueue(queue, exchange, routingKey);

            channel.publish(exchange, routingKey, Buffer.from(log));

            setTimeout(() => {
                channel.close();
                connection.close();
            }, 500);
        });
    });
}



// Connect to MongoDB
MongoClient.connect(uri, { useUnifiedTopology: true })
    .then((client) => {
        console.log("Connected to MongoDB");
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Swagger setup
        const swaggerDocument = YAML.load("./swagger.yaml");
        app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));


        // Get all products
        app.get("/products", jwtAuth, (req, res) => {
            const correlationId = req.headers['x-correlation-id'] || new ObjectId().toString();

            collection
                .find()
                .toArray()
                .then((products) => {
                    const log = `${new Date().toISOString()} INFO http://products:3000/products CorrelationId: ${correlationId} [product-service] - Successfully retrieved products.`;
                    publishLog(log);

                    // Convert product IDs to strings
                    products.forEach((product) => {
                        product.id = product._id.toString();
                        delete product._id;
                    });

                    res.json(products);

                    // Send statistics request to Heroku app
                    // axios.post('https://statistics-service-api.herokuapp.com/add-statistic', { service: "Product", endpoint: "get-all" })
                    axios.post('https://statistics-app-cc50d2934119.herokuapp.com/add-statistic', { service: "Product", endpoint: "get-all" })
                        .then(() => {
                            console.log("Statistics sent successfully.");
                        })
                        .catch((error) => {
                            console.error("Failed to send statistics:", error);
                        });
                })
                .catch((error) => {
                    const log = `${new Date().toISOString()} ERROR http://products:3000/products CorrelationId: ${correlationId} [product-service] - Failed to retrieve products.`;
                    publishLog(log);
                    console.error("Error fetching products:", error);
                    res.status(500).json({ error: "Failed to fetch products" });
                });
        });


        // Get a single product by ID
        app.get("/products/:id", jwtAuth, (req, res) => {
            const productId = new ObjectId(req.params.id);
            const correlationId = req.headers['x-correlation-id'] || new ObjectId().toString();

            collection
                .findOne({ _id: productId })
                .then((product) => {
                    if (product) {
                        const log = `${new Date().toISOString()} INFO http://products:3000/products/${productId} CorrelationId: ${correlationId} [product-service] - Successfully retrieved product.`;
                        publishLog(log);
                        res.json(product);

                        // Send statistics request to Heroku app
                        // axios.post('https://statistics-service-api.herokuapp.com/add-statistic', { service: "Product", endpoint: "get" })
                        axios.post('https://statistics-app-cc50d2934119.herokuapp.com/add-statistic', { service: "Product", endpoint: "get-by-id" })
                            .then(() => {
                                console.log("Statistics sent successfully.");
                            })
                            .catch((error) => {
                                console.error("Failed to send statistics:", error);
                            });
                    } else {
                        const log = `${new Date().toISOString()} ERROR http://products:3000/products/${productId} CorrelationId: ${correlationId} [product-service] - Product not found.`;
                        publishLog(log);
                        res.status(404).json({ error: "Product not found" });
                    }
                })
                .catch((error) => {
                    const log = `${new Date().toISOString()} ERROR http://products:3000/products/${productID} CorrelationId: ${correlationId} [product-service] - Failed to retrieve products.`;
                    publishLog(log);
                    console.error("Error fetching product:", error);
                    res.status(500).json({ error: "Failed to fetch product" });
                });
        });

// Create a new product
app.post("/products", jwtAuth, (req, res) => {
    const newProduct = req.body;
    const correlationId = req.headers['x-correlation-id'] || new ObjectId().toString();

    collection
        .insertOne(newProduct)
        .then((result) => {
            const log = `${new Date().toISOString()} INFO http://products:3000/products CorrelationId: ${correlationId} [product-service] - Successfully created a product.`;
            publishLog(log);
            res.status(201).json(result.ops);

            // Send statistics request to Heroku app
            axios.post('https://statistics-app-cc50d2934119.herokuapp.com/add-statistic', { service: "Product", endpoint: "create" })
                .then(() => {
                    console.log("Statistics sent successfully.");
                })
                .catch((error) => {
                    console.error("Failed to send statistics:", error);
                });
        })
        .catch((error) => {
            const log = `${new Date().toISOString()} ERROR http://products:3000/products CorrelationId: ${correlationId} [product-service] - Failed to create a product.`;
            publishLog(log);
            console.error("Error creating product:", error);
            res.status(500).json({ error: "Failed to create product" });
        });
});

        // Update a product
        app.put('/products/:id', jwtAuth, (req, res) => {
            const productId = new ObjectId(req.params.id);
            const updatedProduct = req.body;
            const correlationId = req.headers['x-correlation-id'] || new ObjectId().toString();

            collection.findOneAndUpdate(
                { _id: productId },
                { $set: updatedProduct },
                { returnOriginal: false }
            )
                .then(result => {
                    if (result.value) {
                        const log = `${new Date().toISOString()} INFO http://products:3000/products/${productId} CorrelationId: ${correlationId} [product-service] - Product updated successfully.`;
                        publishLog(log);
                        res.json(result.value);

                        // Send statistics request to Heroku app
                        // axios.post('https://statistics-service-api.herokuapp.com/add-statistic', { service: "Product", endpoint: "update" })
                        axios.post('https://statistics-app-cc50d2934119.herokuapp.com/add-statistic', { service: "Product", endpoint: "update" })
                            .then(() => {
                                console.log("Statistics sent successfully.");
                            })
                            .catch((error) => {
                                console.error("Failed to send statistics:", error);
                            });

                    } else {
                        const log = `${new Date().toISOString()} ERROR http://products:3000/products/${productId} CorrelationId: ${correlationId} [product-service] - Product not found.`;
                        publishLog(log);
                        res.status(404).json({ error: 'Product not found' });
                    }
                })
                .catch(error => {
                    const log = `${new Date().toISOString()} ERROR http://products:3000/products/${productId} CorrelationId: ${correlationId} [product-service] - Failed to update product.`;
                    publishLog(log);
                    console.error('Error updating product:', error);
                    res.status(500).json({ error: 'Failed to update product' });
                });
        });


        // Delete a product
        app.delete('/products/:id', jwtAuth, (req, res) => {
            const productId = new ObjectId(req.params.id);
            const correlationId = req.headers['x-correlation-id'] || new ObjectId().toString();

            collection.findOneAndDelete({ _id: productId })
                .then(result => {
                    if (result.value) {
                        const log = `${new Date().toISOString()} INFO http://products:3000/products/${productId} CorrelationId: ${correlationId} [product-service] - Product deleted successfully.`;
                        publishLog(log);
                        res.json({ message: 'Product deleted successfully' });

                        // Send statistics request to Heroku app
                        // axios.post('https://statistics-service-api.herokuapp.com/add-statistic', { service: "Product", endpoint: "delete" })
                        axios.post('https://statistics-app-cc50d2934119.herokuapp.com/add-statistic', { service: "Product", endpoint: "delete" })
                            .then(() => {
                                console.log("Statistics sent successfully.");
                            })
                            .catch((error) => {
                                console.error("Failed to send statistics:", error);
                            });

                    } else {
                        const log = `${new Date().toISOString()} ERROR http://products:3000/products/${productId} CorrelationId: ${correlationId} [product-service] - Product not found.`;
                        publishLog(log);
                        res.status(404).json({ error: 'Product not found' });
                    }
                })
                .catch(error => {
                    const log = `${new Date().toISOString()} ERROR http://products:3000/products/${productId} CorrelationId: ${correlationId} [product-service] - Failed to delete product.`;
                    publishLog(log);
                    console.error('Error deleting product:', error);
                    res.status(500).json({ error: 'Failed to delete product' });
                });
        });
        //----

        // Delete products by name
        app.delete("/products/name/:name", jwtAuth, (req, res) => {
            const name = req.params.name;
            const correlationId = req.headers["x-correlation-id"] || new ObjectId().toString();

            collection
                .deleteMany({ name: name })
                .then(() => {
                    const log = `${new Date().toISOString()} INFO http://products:3000/products/name/${name} CorrelationId: ${correlationId} [product-service] - Products with name '${name}' deleted successfully.`;
                    publishLog(log);
                    res.json({ message: `Products with name '${name}' deleted successfully` });

                    // Send statistics request to Heroku app
                    axios
                        // .post("https://statistics-service-api.herokuapp.com/add-statistic", { service: "Product", endpoint: "delete-by-name" })
                        .post('https://statistics-app-cc50d2934119.herokuapp.com/add-statistic', { service: "Product", endpoint: "delete-by-name" })
                        .then(() => {
                            console.log("Statistics sent successfully.");
                        })
                        .catch((error) => {
                            console.error("Failed to send statistics:", error);
                        });
                })
                .catch((error) => {
                    const log = `${new Date().toISOString()} ERROR http://products:3000/products/name/${name} CorrelationId: ${correlationId} [product-service] - Failed to delete products with name '${name}'.`;
                    publishLog(log);
                    console.error("Error deleting products by name:", error);
                    res.status(500).json({ error: `Failed to delete products with name '${name}'` });
                });
        });

// Delete a product by price
app.delete("/products/price/:price", jwtAuth, (req, res) => {
    const price = parseFloat(req.params.price);
    const correlationId = req.headers["x-correlation-id"] || new ObjectId().toString();

    collection
        .deleteMany({ price: price })
        .then(() => {
            const log = `${new Date().toISOString()} INFO http://products:3000/products/price/${price} CorrelationId: ${correlationId} [product-service] - Products with price '${price}' deleted successfully.`;
            publishLog(log);
            res.json({ message: `Products with price '${price}' deleted successfully` });

            // Send statistics request to Heroku app
            axios
            // .post("https://statistics-service-api.herokuapp.com/add-statistic", { service: "Product", endpoint: "delete-by-price" })
            .post('https://statistics-app-cc50d2934119.herokuapp.com/add-statistic', { service: "Product", endpoint: "delete-by-price" })
            .then(() => {
                console.log("Statistics sent successfully.");
            })
            .catch((error) => {
                console.error("Failed to send statistics:", error);
            });
         })

      
        .catch((error) => {
            const log = `${new Date().toISOString()} ERROR http://products:3000/products/price/${price} CorrelationId: ${correlationId} [product-service] - Failed to delete products with price '${price}'.`;
            publishLog(log);
            console.error("Error deleting products by price:", error);
            res.status(500).json({ error: `Failed to delete products with price '${price}'` });
        });
});

        // Get products by price
        app.get("/products/getprice/:price", jwtAuth, (req, res) => {
            const price = parseFloat(req.params.price);
            const correlationId = req.headers["x-correlation-id"] || new ObjectId().toString();

            collection
                .find({ price: price })
                .toArray()
                .then((products) => {
                    const log = `${new Date().toISOString()} INFO http://products:3000/products/price/${price} CorrelationId: ${correlationId} [product-service] - Products with price '${price}' retrieved successfully.`;
                    publishLog(log);
                    res.json(products);

                    // Send statistics request to Heroku app
                    axios
                    
                        .post('https://statistics-app-cc50d2934119.herokuapp.com/add-statistic', { service: "Product", endpoint: "get-by-price" })
                        .then(() => {
                            console.log("Statistics sent successfully.");
                        })
                        .catch((error) => {
                            console.error("Failed to send statistics:", error);
                        });
                })
                .catch((error) => {
                    const log = `${new Date().toISOString()} ERROR http://products:3000/products/price/${price} CorrelationId: ${correlationId} [product-service] - Failed to retrieve products with price '${price}'.`;
                    publishLog(log);
                    console.error("Error retrieving products by price:", error);
                    res.status(500).json({ error: `Failed to retrieve products with price '${price}'` });
                });
        });


        // Start the server
        const port = 3000;
        const host = '0.0.0.0';
        app.listen(port, host, () => {
            console.log(`Server is running on ${host}:${port}`);
        });
        
    })
    .catch((error) => {
        console.error("Error connecting to MongoDB:", error);
    });
