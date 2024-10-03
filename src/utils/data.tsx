import { unixTimeToTimeAgo } from './Timestamp';
import { linearRegressionLeastSquares } from './math'

const tax: number = 0.02;
const maxTax: number = 1000000;

export class WorldData{
    name: string;
    last_update: string;

    constructor(name: string, last_update: string){
        this.name = name;
        this.last_update = last_update;
    }
}

export class NPCSaleData{
    price: number;
    name: string;
    location: string;
    currency_object_type_id: number;
    currency_quest_flag_display_name: string;
  
    constructor(price: number, name: string, location: string, currency_object_type_id: number = 0, currency_quest_flag_display_name: string = ""){
      this.price = price;
      this.name = name;
      this.location = location;
      this.currency_object_type_id = currency_object_type_id;
      this.currency_quest_flag_display_name = currency_quest_flag_display_name;
    }

    public static isGold(data: NPCSaleData) : boolean {
      return data.currency_object_type_id == 0 && data.currency_quest_flag_display_name == "";
    }
}

export class ItemMetaData{
    id: number;
    category: string;
    tier: number;
    name: string;
    npc_buy: Array<NPCSaleData>;
    npc_sell: Array<NPCSaleData>;
    wiki_name: string;

    constructor(meta_data: {[key: string]: any}){
      this.id = meta_data["id"];
      this.category = meta_data["category"];
      this.tier = meta_data["tier"];
      this.name = meta_data["name"];
      this.npc_buy = meta_data["npc_buy"];
      this.npc_sell = meta_data["npc_sell"];
      this.wiki_name = meta_data["wiki_name"];
    }
}

export class MarketboardTraderData{
  name: TextMetric;
  amount: Metric;
  price: Metric;
  total_price: Metric;
  time: Metric;

  constructor(server: string, name: string, amount: number, price: number, time: number){
    this.name = new TextMetric(server, "Name", name, "The name of the trader.", "Trader Data");
    this.amount = new Metric(server, "Amount", amount, "The amount of items the trader is buying or selling.", "Trader Data", false);
    this.price = new Metric(server, "Piece price", price, "The price the trader is buying or selling the items for.", "Trader Data", false, "", "/Gold_Coin.png");
    this.total_price = new Metric(server, "Total price", price * amount, "The total price the trader is buying or selling the items for.", "Trader Data", false, "", "/Gold_Coin.png");
    this.time = new Metric(server, "Ends at", time, "The datetime string at which the offer expires.", "Trader Data", false, "", "", (value) => new Date(value * 1000).toLocaleString());
  }
}

export class Marketboard{
  id: number;
  sellers: MarketboardTraderData[];
  buyers: MarketboardTraderData[];
  update_time: number;

  constructor(server: string, marketboard: {[key: string]: any}){
    this.id = marketboard["id"];
    this.update_time = marketboard["update_time"];
    this.sellers = marketboard["sellers"].map((x: { [x: string]: any; }) => new MarketboardTraderData(server, x["name"], x["amount"], x["price"], x["time"]));
    this.buyers = marketboard["buyers"].map((x: { [x: string]: any; }) => new MarketboardTraderData(server, x["name"], x["amount"], x["price"], x["time"]));
  }
}

export class Metric{
    server: string;
    name: string;
    value: number;
    localisedValue: string;
    description: string;
    category: string = "";
    additionalInfo: string;
    icon: string;
    canBeNegative: boolean;
    siblings: Metric[] = [];
    toLocaleStringFunction: (value: number) => string;
  
    constructor(server: string, name: string, value: number, description: string, category: string, canBeNegative: boolean = true, additionalInfo: string = "", icon: string = "", toLocaleStringFunction: (value: number) => string = (value) => value.toLocaleString()) {
      this.server = server;
      this.name = name;
      this.value = value;
      this.canBeNegative = canBeNegative;
      this.description = description;
      this.category = category;
      this.additionalInfo = additionalInfo;

      this.toLocaleStringFunction = toLocaleStringFunction;
      this.localisedValue = "";
      this.setValue(value);
      
      this.icon = this.localisedValue == "None" ? "" : icon;
    }

    public setValue(value: number){
      this.value = value;
      this.localisedValue = value <= 0 && !this.canBeNegative ? "None" : this.toLocaleStringFunction(value);
    }

    public addSibling(sibling: Metric){
      this.siblings.push(sibling);
    }

    public hasSiblings() : boolean {
      return this.siblings.length > 0;
    }

    /**
     * Returns the sibling with the lowest valid value, including the current metric.
     */
    public getMinSibling() : Metric {
      return this.siblings.concat(this).reduce((a, b) => this.canBeNegative && a.value <= 0 ? b : (a.value < b.value ? a : b));
    }

    /**
     * Returns the sibling with the highest valid value, including the current metric.
     */
    public getMaxSibling() : Metric {
      return this.siblings.concat(this).reduce((a, b) => this.canBeNegative && a.value <= 0 ? b : (a.value > b.value ? a : b));
    }

    /**
     * Returns the siblings sorted by value, including the current metric.
     */
    public getSortedSiblings() : Metric[] {
      return this.siblings.concat(this).sort((a, b) => a.value - b.value);
    }
}

export class TextMetric{
  server: string;
  name: string;
  value: string;
  localisedValue: string;
  description: string;
  category: string = "";
  additionalInfo: string;
  icon: string;
  siblings: Metric[] = [];

  constructor(server: string, name: string, value: string, description: string, category: string, additionalInfo: string = "", icon: string = "") {
    this.server = server;
    this.name = name;
    this.value = value;
    this.localisedValue = value;
    this.description = description;
    this.category = category;
    this.additionalInfo = additionalInfo;
    this.icon = icon;
  }

  public addSibling(sibling: Metric){
    this.siblings.push(sibling);
  }

  public hasSiblings() : boolean {
    return this.siblings.length > 0;
  }

  public getMinSibling() : Metric {
    return this.siblings.reduce((a, b) => a.value < b.value ? a : b);
  }

  public getMaxSibling() : Metric {
    return this.siblings.reduce((a, b) => a.value > b.value ? a : b);
  }
}

export class TrendMetric extends Metric{
  relativeDifference: number;
  difference: number;
  previousValue: number;

  constructor(server: string, name: string, value: number, previousValue: number, description: string, category: string, canBeNegative: boolean = true, additionalInfo: string = "", icon: string = "", toLocaleStringFunction: (value: number) => string = (value) => value.toLocaleString()) {
    super(server, name, value, description, category, canBeNegative, additionalInfo, icon, toLocaleStringFunction);

    this.previousValue = previousValue;
    this.difference = value - previousValue;
    this.relativeDifference = previousValue > 0 ? value / previousValue : 1;
  }
}
  
  export class ItemData{
    sell_offer: TrendMetric;
    buy_offer: TrendMetric;
    month_average_sell: Metric;
    month_average_buy: Metric;
    day_average_sell: TrendMetric;
    day_average_buy: TrendMetric;
    delta_sell_offer: Metric;
    delta_buy_offer: Metric;
    month_lowest_sell: Metric;
    month_lowest_buy: Metric;
    month_highest_sell: Metric;
    month_highest_buy: Metric;
    day_lowest_sell: Metric;
    day_lowest_buy: Metric;
    day_highest_sell: Metric;
    day_highest_buy: Metric;
    npc_sell_price: Metric;
    npc_buy_price: Metric;
    month_sold: Metric;
    month_bought: Metric;
    day_sold: TrendMetric;
    day_bought: TrendMetric;
    profit: Metric;
    average_profit: Metric;
    potential_profit: Metric;
    npc_profit: Metric;
    npc_immediate_profit: Metric;
    total_immediate_profit: Metric;
    transfer_average_profit: Metric;
    transfer_potential_profit: Metric
    sell_offers: Metric;
    buy_offers: Metric;
    active_traders: Metric;
    id: Metric;
    category: TextMetric;
    time: Metric;
    name: string;
  
    constructor(server: string, item: {[key: string]: any}, meta_data: ItemMetaData, tibiaCoinData: {[key: string]: any} | null = null) {
      this.id = new Metric(server, "Item Id", item["id"], "The Tibia internal id of the item.", "Meta data", false);
      this.time = new Metric(server, "Time", item["time"], "The time the data was collected.", "Meta data", false, "", "", (value) => unixTimeToTimeAgo(value));
      
      var tibiaCoinPrice = Math.max(tibiaCoinData != null ? (tibiaCoinData["day_average_sell"] > -1 ? tibiaCoinData["day_average_sell"] : tibiaCoinData["sell_offer"]) : 1, 1);
      var tibiaCoinPriceMonth = Math.max(tibiaCoinData != null ? (tibiaCoinData["month_average_sell"] > -1 ? tibiaCoinData["month_average_sell"] : tibiaCoinData["sell_offer"]) : 1, 1);

      var icon = tibiaCoinPrice > 1 ? "/Tibia_Coins.gif" : "/Gold_Coin.png";

      // Average data.
      this.month_average_sell = new Metric(server, "Avg. Sell Price (mo.)", item["month_average_sell"] / tibiaCoinPriceMonth, "The average sell price of the item in the past 30 days.", "Average Prices", true, "", icon);
      this.month_average_buy = new Metric(server, "Avg. Buy Price (mo.)", item["month_average_buy"] / tibiaCoinPriceMonth, "The average buy price of the item in the past 30 days.", "Average Prices", true, "", icon);
      this.day_average_sell = new TrendMetric(server, "Avg. Sell Price (day)", item["day_average_sell"] / tibiaCoinPrice, this.month_average_sell.value, "The average sell price of the item in the past 24 hours.", "Average Prices", true, "", icon);
      this.day_average_buy = new TrendMetric(server, "Avg. Buy Price (day)", item["day_average_buy"] / tibiaCoinPrice, this.month_average_buy.value, "The average buy price of the item in the past 24 hours.", "Average Prices", true, "", icon);

      // Buy & Sell data.
      this.sell_offer = new TrendMetric(server, "Sell Price", item["sell_offer"] / tibiaCoinPrice, this.month_average_sell.value, "The current lowest sell price of the item on the market board.", "Buy & Sell Prices", false, "", icon);
      this.buy_offer = new TrendMetric(server, "Buy Price", item["buy_offer"] / tibiaCoinPrice, this.month_average_buy.value, "The current highest buy price of the item on the market board.", "Buy & Sell Prices", false, "", icon);
      this.delta_sell_offer = new Metric(server, "Delta Sell Price", (this.sell_offer.value > 0 ? this.sell_offer.value - this.month_average_sell.value : 0) / tibiaCoinPrice, "The difference between the current sell price and the average monthly sell price. If this is very negative, this is a great time to buy. If this is very positive, this is a great time to sell.", "Buy & Sell Prices", this.sell_offer.value >= 0, "", icon);
      this.delta_buy_offer = new Metric(server, "Delta Buy Price", (this.buy_offer.value > 0 ? this.buy_offer.value - this.month_average_buy.value : 0) / tibiaCoinPrice, "The difference between the current buy price and the average monthly buy price. If this is very negative, this is a great time to buy. If this is very positive, this is a great time to sell.", "Buy & Sell Prices", this.buy_offer.value >= 0, "", icon);
      
      // Extreme data.
      this.month_lowest_sell = new Metric(server, "Lowest Sell Price (mo.)", item["month_lowest_sell"] / tibiaCoinPriceMonth, "The lowest sell price of the item in the last 30 days.", "Extreme Prices", false, "", icon);
      this.month_lowest_buy = new Metric(server, "Lowest Buy Price (mo.)", item["month_lowest_buy"] / tibiaCoinPriceMonth, "The lowest buy price of the item in the last 30 days.", "Extreme Prices", false, "", icon);
      this.month_highest_sell = new Metric(server, "Highest Sell Price (mo.)", item["month_highest_sell"] / tibiaCoinPriceMonth, "The highest sell price of the item in the last 30 days.", "Extreme Prices", false, "", icon);
      this.month_highest_buy = new Metric(server, "Highest Buy Price (mo.)", item["month_highest_buy"] / tibiaCoinPriceMonth, "The highest buy price of the item in the last 30 days.", "Extreme Prices", false, "", icon);
      this.day_lowest_sell = new Metric(server, "Lowest Sell Price (day)", item["day_lowest_sell"] / tibiaCoinPrice, "The lowest sell price of the item in the last 24 hours.", "Extreme Prices", false, "", icon);
      this.day_lowest_buy = new Metric(server, "Lowest Buy Price (day)", item["day_lowest_buy"] / tibiaCoinPrice, "The lowest buy price of the item in the last 24 hours.", "Extreme Prices", false, "", icon);
      this.day_highest_sell = new Metric(server, "Highest Sell Price (day)", item["day_highest_sell"] / tibiaCoinPrice, "The highest sell price of the item in the last 24 hours.", "Extreme Prices", false, "", icon);
      this.day_highest_buy = new Metric(server, "Highest Buy Price (day)", item["day_highest_buy"] / tibiaCoinPrice, "The highest buy price of the item in the last 24 hours.", "Extreme Prices", false, "", icon);

      this.month_sold = new Metric(server, "Sold (mo.)", item["month_sold"], "The amount of items sold in the last 30 days.", "Transaction Amounts", false);
      this.month_bought = new Metric(server, "Bought (mo.)", item["month_bought"], "The amount of items bought in the last 30 days.", "Transaction Amounts", false);
      this.day_sold = new TrendMetric(server, "Sold (day)", item["day_sold"], Math.round(this.month_sold.value / 28), "The amount of items sold in the last 24 hours.", "Transaction Amounts", false);
      this.day_bought = new TrendMetric(server, "Bought (day)", item["day_bought"], Math.round(this.month_bought.value / 28), "The amount of items bought in the last 24 hours.", "Transaction Amounts", false);

      this.sell_offers = new Metric(server, "Sell Offers", item["sell_offers"], "The current amount of sell offers for this item.", "Market Activity", false);
      this.buy_offers = new Metric(server, "Buy Offers", item["buy_offers"], "The current amount of buy offers for this item.", "Market Activity", false);
      this.active_traders = new Metric(server, "Traders", item["active_traders"], "The amount of buy or sell offers in the last 24 hours, whichever one is smaller. I.e. the amount of other flippers you are competing with.", "Market Activity", false);
  
      // Calculated data.
      var profit = this.sell_offer.value > 0 && this.buy_offer.value > 0 ? Math.round((this.sell_offer.value - this.buy_offer.value) - Math.min(this.sell_offer.value * tax, maxTax)) : 0;
      this.profit = new Metric(server, "Profit", profit / tibiaCoinPrice, `The profit you would get for flipping this item right now. Minus ${tax} tax.`, "Profit Metrics", false, "", icon);
      var avgProfit = this.month_average_sell.value > 0 && this.month_average_buy.value > 0 ? Math.round((this.month_average_sell.value - this.month_average_buy.value) - Math.min(this.sell_offer.value * tax, maxTax)) : 0;
      this.average_profit = new Metric(server, "Avg. Profit", avgProfit / tibiaCoinPriceMonth, `The profit you would get on average for flipping this item. Minus ${tax} tax.`, "Profit Metrics", false, "", icon);

      if(meta_data != null){
        this.name = meta_data.wiki_name ? meta_data.wiki_name : meta_data.name;

        // NPC data.
        var npc_sell = meta_data.npc_sell.filter((x) => NPCSaleData.isGold(x)).sort((a, b) => a.price - b.price);
        var npc_buy = meta_data.npc_buy.filter((x) => NPCSaleData.isGold(x)).sort((a, b) => b.price - a.price);
        this.npc_sell_price = new Metric(server, "NPC Sell Price", npc_sell.length > 0 ? npc_sell[npc_sell.length - 1].price : -1, "The lowest price NPCs sell this item for.", "Buy & Sell Prices", false, npc_sell.length > 0 ? `${npc_sell[npc_sell.length - 1].name} in ${npc_sell[npc_sell.length - 1].location}` : "", "/Gold_Coin.png");
        this.npc_buy_price = new Metric(server, "NPC Buy Price", npc_buy.length > 0 ? npc_buy[0].price : -1, "The highest price NPCs buy this item for.", "Buy & Sell Prices", false, npc_buy.length > 0 ? `${npc_buy[0].name} in ${npc_buy[0].location}` : "", "/Gold_Coin.png");
        this.category = new TextMetric(server, "Category", meta_data.category, "The market category of the item.", "Meta data");

        var sellToNPCProfit = this.buy_offer.value > 0 && this.npc_buy_price.value > 0 ? Math.round((this.npc_buy_price.value - this.buy_offer.value) - Math.min(this.buy_offer.value * tax, maxTax)) : -1;
        var sellToMarketProfit = this.sell_offer.value > 0 && this.npc_sell_price.value > 0 ? Math.round((this.sell_offer.value - this.npc_sell_price.value) - Math.min(this.sell_offer.value * tax, maxTax)) : -1;
        var npcProfit = Math.max(sellToNPCProfit, sellToMarketProfit);

        this.npc_profit = new Metric(server, "NPC Profit", npcProfit == -1 ? 0 : npcProfit, "The profit you would get for flipping this item between the market and NPCs, by adding offers. Minus 2% tax.", "Profit Metrics", false, "/Gold_Coin.png");

        sellToNPCProfit = this.sell_offer.value > 0 && this.npc_buy_price.value > 0 ? Math.round((this.npc_buy_price.value - this.sell_offer.value)) : -1;
        sellToMarketProfit = this.npc_sell_price.value > 0 && this.buy_offer.value > 0 ? Math.round((this.buy_offer.value - this.npc_sell_price.value)) : -1;
        npcProfit = Math.max(sellToNPCProfit, sellToMarketProfit);
        var npcProfitAdditionalInfo = "";

        if (npcProfit > 0) {
          if (sellToNPCProfit > sellToMarketProfit) {
            var npc_offer = npc_buy[0];
            npcProfitAdditionalInfo = `Buy for ${this.sell_offer.value} from Market.\nSell to NPC ${npc_offer.name} in ${npc_offer.location} for ${npc_offer.price}.\n${sellToNPCProfit} profit.`;
          }
          else {
            var npc_offer = npc_sell[npc_sell.length - 1];
            npcProfitAdditionalInfo = `Buy for ${npc_offer.price} from NPC ${npc_offer.name} in ${npc_offer.location}.\nSell to Market for ${this.buy_offer.value}.\n${sellToMarketProfit} profit.`;
          }
        }

        this.npc_immediate_profit = new Metric(server, "NPC Immediate Profit", npcProfit == -1 ? 0 : npcProfit, "The highest profit you can get right now for flipping this item between the market and NPCs once.", "Profit Metrics", false, npcProfitAdditionalInfo, "/Gold_Coin.png");
        this.total_immediate_profit = new Metric(server, "Total NPC Immediate Profit", item["total_immediate_profit"], "The total profit you can get right now for flipping this item between the market and NPCs, by exhausting all existing offers.", "Profit Metrics", false, item["total_immediate_profit_info"], "/Gold_Coin.png");
      }
      else{
        this.name = `${this.id} (Unknown)`;
        this.npc_sell_price = new Metric(server, "NPC Sell Price", -1, "The lowest price NPCs sell this item for.", "Buy & Sell Prices", false, "", "/Gold_Coin.png");
        this.npc_buy_price = new Metric(server, "NPC Buy Price", -1, "The highest price NPCs buy this item for.", "Buy & Sell Prices", false, "", "/Gold_Coin.png");
        this.category = new TextMetric(server, "Category", "Unknown", "The market category of the item.", "Meta data");
        this.npc_profit = new Metric(server, "NPC Profit", -1, "The profit you would get for flipping this item between the market and NPCs, by adding offers. Minus 2% tax.", "Profit Metrics", false, "", "/Gold_Coin.png");
        this.npc_immediate_profit = new Metric(server, "NPC Immediate Profit", -1, "The highest profit you can get right now for flipping this item between the market and NPCs once.", "Profit Metrics", false, "", "/Gold_Coin.png");
        this.total_immediate_profit = new Metric(server, "Total NPC Immediate Profit", -1, "The total profit you can get right now for flipping this item between the market and NPCs, by exhausting all existing offers.", "Profit Metrics", false, "", "/Gold_Coin.png");
      }

      this.potential_profit = new Metric(server, "Potential Profit", (this.profit.value * Math.min(this.month_sold.value, this.month_bought.value)) / tibiaCoinPriceMonth, "The total profit that has potentially been generated by this item in the past 30 days.", "Profit Metrics", false, "", icon);
      this.transfer_potential_profit = new Metric(server, "Transfer Potential Profit", 0, "The total profit that has potentially been generated by this item in the past 30 days, if transfered between worlds. Minus 2% tax.", "Profit Metrics", true, "", icon);
      this.transfer_average_profit = new Metric(server, "Transfer Avg. Profit", 0, "The average profit that could be generated by this item if transfered between worlds. Minus 2% tax.", "Profit Metrics", true, "", icon);
    }

    /**
     * Adds a sibling to the item, i.e. the same item on another server.
     * @param server The server the item is on.
     * @param item The item data.
     * @param meta_data The meta data of the item.
     * @param tibiaCoinData The Tibia Coin data of the item on the server.
     */
    public addSibling(server: string, item: {[key: string]: any}, meta_data: ItemMetaData, tibiaCoinData: {[key: string]: any} | null = null){
      var sibling = new ItemData(server, item, meta_data, tibiaCoinData);
      this.addSiblingObject(sibling);
    }

    /**
     * Adds a sibling to the item, i.e. the same item on another server.
     * @param sibling The sibling item to add.
     */
    public addSiblingObject(sibling: ItemData){
      var siblingsProperties: [string, any][] = Object.entries(sibling).sort((a, b) => a[0].localeCompare(b[0]));
      var currentProperties: [string, any][] = Object.entries(this).sort((a, b) => a[0].localeCompare(b[0]));

      // Go through all the metrics and add the siblings.
      for (var i = 0; i < currentProperties.length; i++) {
        var key = currentProperties[i][0];
        var value = currentProperties[i][1];
        var siblingValue = siblingsProperties[i][1];

        // Skip the transfer values from adding siblings.
        if (key.includes("transfer"))
          continue;

        if (value instanceof Metric) {
          var siblingMetric = siblingValue as Metric;
          value.addSibling(siblingMetric);
        }
        else if (value instanceof TrendMetric) {
          var siblingTrendMetric = siblingValue as TrendMetric;
          value.addSibling(siblingTrendMetric);
        }
        // TextMetric does not have siblings.
      }

      // Adjust the transfer profits.
      var highestAverageSellOffer = this.month_average_sell.getMaxSibling();
      var lowestAverageBuyOffer = this.month_average_buy.getMinSibling();

      if(highestAverageSellOffer.value > 0 && lowestAverageBuyOffer.value > 0){
        this.transfer_average_profit.setValue(highestAverageSellOffer.value - lowestAverageBuyOffer.value);
        this.transfer_average_profit.setValue(this.transfer_average_profit.value - Math.min(this.transfer_average_profit.value * tax, maxTax));
        this.transfer_average_profit.additionalInfo = `Buy for ${lowestAverageBuyOffer.localisedValue} on ${lowestAverageBuyOffer.server}.\nSell for ${highestAverageSellOffer.localisedValue} on ${highestAverageSellOffer.server}.\nProfit: ${this.transfer_average_profit.localisedValue}`;
  
        this.transfer_potential_profit.setValue(0);
        this.transfer_potential_profit.additionalInfo = ``;
      }
    }
    
    /**
     * Returns a value indicating its importance compared to other items, for the default sorting.
     * @returns The trend value of the item.
     */
    public getTrendValue() : number {
      var offerAmount = this.sell_offers.value + this.buy_offers.value;
      var offerIncrease = (this.day_sold.relativeDifference + this.day_bought.relativeDifference) / 2;
      var trendFactor = 2;

      var trendValue = offerAmount;// * Math.pow(offerIncrease, trendFactor);

      return trendValue;
    }
}

export var exampleMetaData: ItemMetaData = new ItemMetaData({
  "id": 1,
  "category": "Weapons",
  "tier": 1,
  "name": "Sword",
  "npc_buy": [
  ],
  "npc_sell": [
  ],
  "wiki_name": "Sword"
});

export var exampleMarketboard: MarketboardTraderData = new MarketboardTraderData("Antica", "Trader", 1, 1, 1);

export var exampleItem: ItemData = new ItemData("Antica", {
  "id": 22118,
  "time": 1703821820.7874076,
  "buy_offer": 36133,
  "sell_offer": 36420,
  "month_average_sell": 37734,
  "month_average_buy": 36947,
  "month_sold": 8315,
  "month_bought": 15942,
  "active_traders": 12,
  "month_highest_sell": 41000,
  "month_lowest_buy": 1,
  "month_lowest_sell": 34500,
  "month_highest_buy": 39511,
  "buy_offers": 32,
  "sell_offers": 32,
  "day_average_sell": -1,
  "day_average_buy": -1,
  "day_sold": -1,
  "day_bought": -1,
  "day_highest_sell": -1,
  "day_lowest_sell": -1,
  "day_highest_buy": -1,
  "day_lowest_buy": -1,
  "total_immediate_profit": -1,
  "total_immediate_profit_info": ""
}, exampleMetaData, null);

export var weekDays: string[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Returns the Tibian weekday of the given time.
 * I.e. subtract 9 hours to make days start at server-save. (technically 8 hours CET, 9 hours CEST, but this is easier)
 */
export function getWeekday(time: number) : number {
    return new Date((time - 32400) * 1000).getUTCDay();
}

/**
 * Returns the weekday name of the given weekday.
 */
export function getWeekdayName(weekday: number) : string {
    return weekDays[weekday];
}

/**
 * Returns the events for the given timestamp.
 */
export function timestampToEvents(unixTimestamp: number, events: { [date: string]: string[]}) : string[] {
  var dateTime: Date = new Date(unixTimestamp * 1000);
  var dateKey = `${dateTime.getUTCFullYear()}-${(dateTime.getUTCMonth() + 1).toString().padStart(2, "0")}-${(dateTime.getUTCDate()).toString().padStart(2, "0")}T00:00:00`;

  return dateKey in events ? events[dateKey] : [];
}

/**
 * Replaces the newlines of a string with HTML breaks.
 * @param text 
 * @returns 
 */
export function newLineToBreaks(text: string) : any {
  return text.split("\n").map((item, key) => {
    return <span key={key}>{item}<br/></span>
  });
}

/**
 * A class that holds data for a single time point.
 */
export class CustomHistoryData{
    data: {[name: string]: any} = {};
    time: number;
    events: string[];
  
    constructor(time: number, events: string[]){
      this.time = time;
      this.events = events;
    }

    /**
     * Adds the data to the history data.
     */
    public addData(name: string, value: number, canBeNegative: boolean = false){
      if(value == null || value == undefined || (value < 0 && !canBeNegative)){
        return;
      }

      this.data[name] = value;
    }

    /**
     * Returns the data as a dynamic object to be used with charts.
     */
    public asDynamic() : {[name: string]: number} {
      var dynamicData: {[name: string]: any} = {};
      for(var name in this.data){
        dynamicData[name] = this.data[name];
      }

      dynamicData["time"] = this.time;
      dynamicData["events"] = this.events;

      return dynamicData;
    }
}

export class CustomTimeGraph{
    data: CustomHistoryData[] = [];
    colours: {[name: string]: string} = {};
    labels: {[name: string]: string} = {};
    isWeekdayGraph: boolean = false;

    /**
     * Adds the data to the time data.
     */
    public addData(historyData: CustomHistoryData){
      this.data.push(historyData);
    }

    /**
     * Adds a colour to the graph.
     */
    public addDetail(name: string, colour: string, label: string){
      this.colours[name] = colour;
      this.colours[name + "Trend"] = colour + "77";
      this.labels[name] = label;
      this.labels[name + "Trend"] = label + " Trend Hidden";
    }

    /**
     * Calculates and sets the trend values for each data point using linear regression.
     */
    public calculateTrend() {
      for(var name in this.labels){
        var x_values: number[] = [];
        var y_values: any[] = [];

        for(var i = 0; i < this.data.length; i++){
          if (this.data[i].data[name] == null || this.data[i].data[name] == undefined || this.data[i].data[name] < 0)
            continue;

          x_values.push(this.data[i].time);
          y_values.push(this.data[i].data[name]);
        }
        
        var trend = linearRegressionLeastSquares(x_values, y_values);

        for(var i = 0; i < this.data.length; i++){
          var trendValue = trend.m * this.data[i].time + trend.b;
          this.data[i].addData(name + "Trend", trendValue > 0 ? trendValue : 0);
        }
      }
    }
}