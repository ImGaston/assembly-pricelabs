# PriceLabs Customer API — Reference

## Swagger docs

Full spec: https://app.swaggerhub.com/apis-docs/Customer_API/customer_api/1.0.0-oas3

## Authentication

API key obtained from PriceLabs Account Settings → enable "Customer API" toggle.

Pass as query parameter: `?api_key=YOUR_KEY`

## Base URL

`https://api.pricelabs.co/v1`

## Confirmed endpoints

### GET /v1/listings

Returns all listings in the account with occupancy and market data.

**Response**:
```json
{
  "listings": [
    {
      "id": "834874",
      "pms": "rentalsunited",
      "name": "Rentals United - PriceLabs1New",
      "latitude": 41.8781136,
      "longitude": -87.6297982,
      "country": "United States",
      "city_name": "Chicago",
      "state": "Illinois",
      "no_of_bedrooms": 3,
      "cleaning_fees": 70,
      "min": 90,
      "base": 145,
      "max": 200,
      "group": "testgroup",
      "subgroup": "testsubgroup",
      "tags": "testtag",
      "notes": "testnotes",
      "isHidden": false,
      "push_enabled": false,
      "occupancy_next_7": 100,
      "market_occupancy_next_7": 75,
      "occupancy_next_30": 90,
      "market_occupancy_next_30": 85,
      "occupancy_next_60": 87,
      "market_occupancy_next_60": 67,
      "occupancy_past_90": 78,
      "market_occupancy_past_90": 87,
      "revenue_past_7": 76,
      "stly_revenue_past_7": 67,
      "recommended_base_price": 120,
      "last_date_pushed": "2023-03-15T11:23:21.000Z",
      "last_refreshed_at": "2023-04-10T14:06:29+00:00"
    }
  ]
}
```

### GET /v1/listings/{listing_id}

Returns a single listing. Same fields as above.

### GET /v1/listings/{listing_id}/overrides

Returns per-date price overrides for a listing.

**Response**:
```json
{
  "overrides": [
    {
      "date": "2023-07-16",
      "price": "144",
      "price_type": "fixed",
      "currency": "EUR",
      "min_stay": 5,
      "min_price": 100,
      "min_price_type": "fixed",
      "max_price": 155,
      "max_price_type": "fixed",
      "check_in_check_out_enabled": "1",
      "check_in": "0000010",
      "check_out": "0000001",
      "reason": "Test Reason"
    }
  ]
}
```

### GET /v1/reservations

Returns reservations for a listing.

**Parameters**:
- `listing_id` — filter by listing

**Response**:
```json
{
  "pms_name": "string",
  "next_page": true,
  "data": [
    {
      "listing_id": "string",
      "listing_name": "string",
      "reservation_id": "string",
      "check_in": "YYYY-MM-DD",
      "check_out": "YYYY-MM-DD",
      "booking_status": "booked",
      "booked_date": "YYYY-MM-DD",
      "rental_revenue": "string",
      "total_cost": "string",
      "no_of_days": 0,
      "currency": "string",
      "cancelled_on": "string"
    }
  ]
}
```

### GET /v1/neighborhood

Returns market neighborhood data with percentile prices and occupancy.

Key fields in response:
- `data.data["Future Percentile Prices"]` — percentile prices per date (25th, 50th, 75th, 90th)
- `data.data["Future Occ/New/Canc"]` — occupancy, new bookings, cancellations per date
- `data.data["Summary Table Base Price"]` — base price percentiles
- Labels include: Occupancy, Occupancy_LY, Occupancy_STLY

## Field mapping (API → Dashboard)

| API field | Dashboard field | Notes |
|-----------|----------------|-------|
| `id` | `listingId` | String, varies by PMS |
| `name` | — | We use config name instead |
| `city_name` + `state` | `city` | We use config city |
| `no_of_bedrooms` | `bedrooms` | Integer |
| `base` | `basePrice` | Base price setting |
| `min` | — | Min price setting |
| `max` | — | Max price setting |
| `occupancy_next_30` | `occupancy30d` | Percentage 0-100 |
| `market_occupancy_next_30` | `marketOccupancy30d` | Percentage 0-100 |
| reservation check_in/check_out | `isBooked` per date | Walk nights of each reservation |
| override.price | `recommendedPrice` | Per-date price |
| override.min_stay | `minStay` | Per-date min stay |

## Important notes

1. **Listing IDs vary by PMS**:
   - Hostaway: numeric IDs (e.g., "121000", "80594")
   - Hospitable: UUIDs (e.g., "07b4e0ba-b860-4466-95a5-373dbad583d9")

2. **Rate limits**: Unknown. Implement conservative caching (6h minimum).

3. **Data freshness**: PriceLabs syncs prices overnight (6 PM - 6 AM Chicago time).

4. **Occupancy data** comes from the listings endpoint directly — no separate call needed.

5. **Overrides** are manually set price customizations, not dynamic recommendations. Dates without overrides use the listing's base price.

## Postman collection

- https://documenter.getpostman.com/view/507656/SVSEurQC
- https://www.postman.com/security-geoscientist-28133657/pricelabs/collection/yu0l484/pricelabs-api
