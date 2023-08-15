import requests
import uuid
import pymongo
import bson
# Zagon: python testProd.py
BASE_URL = "http://localhost:3000"
TOKEN = ""  # You can set your token value here

headers = {
    "bearer": TOKEN
}

def generate_product():
    return {
        "id": str(bson.ObjectId()),
        "name": "Sample Product",
        "price": 100.50,
        "description": "This is a sample product description."
    }

sample_product = generate_product()

endpoints = [
    ("post", "/products", sample_product),
    ("get", "/products", None),
    ("get", f"/products/{sample_product['id']}", None),
    ("get", f"/products/getprice/{sample_product['price']}", None),
    ("put", f"/products/{sample_product['id']}", sample_product),
    ("delete", f"/products/{sample_product['id']}", None),
    ("delete", f"/products/name/{sample_product['name']}", None),
    ("delete", f"/products/price/{sample_product['price']}", None),
]

def test_endpoint(method, endpoint, data):
    url = BASE_URL + endpoint
    response = requests.request(method, url, headers=headers, json=data)
    
    print(f"Testing {method.upper()} {endpoint}")
    print("Status Code:", response.status_code)
    try:
        print("Response:", response.json())
    except:
        print("Response:", response.text)
    print("="*50)

for method, endpoint, data in endpoints:
    test_endpoint(method, endpoint, data)
