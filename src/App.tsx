import React, { useEffect, useState }  from 'react';
import type { MenuProps } from 'antd';
import { Layout, Drawer, DrawerProps, FloatButton, FloatButtonProps, Collapse, Tooltip as AntTooltip, message, Menu, theme, Select, Button, Input, ConfigProvider, InputNumber, Space, Switch, Table, Typography, Pagination, Image, Modal, Alert, AlertProps, Form, SelectProps } from 'antd';
import { QuestionCircleOutlined, FilterOutlined, BulbFilled, BulbOutlined, OrderedListOutlined } from '@ant-design/icons';
import {LineChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Line, ResponsiveContainer, Tooltip, Brush } from 'recharts';
import './App.css';
import { ColumnType } from 'antd/es/table';
import { timestampToEvents, HistoryData, ItemData, WeekdayData, Metric, TextMetric, exampleItem, NPCSaleData, ItemMetaData, WorldData, CustomTimeGraph, CustomHistoryData } from './utils/data';
import { linearRegressionLeastSquares } from './utils/math'
import { CustomTooltip, DynamicChart } from './utils/CustomToolTip';
import { Timestamp, unixTimeToTimeAgo } from './utils/Timestamp';
import { DefaultOptionType } from 'antd/es/select';

const { Header, Content, Footer, Sider } = Layout;
const { Title } = Typography;
const { Panel } = Collapse;

var events: { [date: string]: string[]} = {}
var cachedMarketResponses: {[server: string]: {timestamp: number, response: string}} = {};
var itemMetaData: {[id: number]: ItemMetaData} = {};
var worldData: WorldData[] = [];
var worldDataDict: {[name: string]: WorldData} = {};
var urlParams = new URLSearchParams(window.location.search);

const App: React.FC = () => {
  /**
   * Send a request to the api to fetch data. Automatically handles errors.
   * @param endpoint The endpoint to fetch data from.
   */
  async function getDataAsync(endpoint: string){
    var items = await fetch(`https://api.tibiamarket.top:8001/${endpoint}`, {headers: {"Authorization": `Bearer ${apiKey}`}}).then(async response => {
      if(response.status != 200){
          var errorMessage = `${response.statusText}. ${await response.text()}`;
          throw new Error(errorMessage);
      }
  
      return response.text();
    }).catch((error) => {
      var endpointWithoutParams = endpoint.split("?")[0];
      messageApi.error(`Fetching ${endpointWithoutParams} failed, please try again in a bit!`, 10);
      messageApi.error(error.message, 10);
      setIsLoading(false);
  
      throw new Error("Fetching tracked items failed!");
    });

    return items;
  }

  /**
   * Gets called when the pagination, filter or sorter changes.
   * @param pagination 
   * @param filters 
   * @param sorter 
   */
  function handleTableChanged(pagination: any, filters: any, sorter: any){
    //console.log(pagination, filters, sorter);
  }

  /**
   * Gets the value of a parameter from the url, localstorage, or the default value if the parameter is not set.
   * @param paramName The name of the parameter to get the value for.
   * @param defaultValue The default value to return if the parameter is not set.
   * @returns The value of the parameter, or the default value if the parameter is not set.
   */
  function getLocalParamValue(paramName: string, defaultValue: string){
    var paramValue = urlParams.get(paramName);
    if(paramValue == null){
      var localValue = localStorage.getItem(`${paramName}Key`);

      if(localValue == null){
        return defaultValue;
      }

      return localValue;
    }

    return paramValue;
  }

  /**
   * Sets the value of a parameter in the url and localstorage.
   * @param paramName The name of the parameter to set the value for.
   * @param paramValue The value to set the parameter to.
   */
  function setLocalParamValue(paramName: string, paramValue: string, hideFromUrl: boolean){
    if(!hideFromUrl){
      urlParams.set(paramName, paramValue);
      // TODO: Make this work without refresh.
      //window.location.search = urlParams.toString();
    }

    localStorage.setItem(`${paramName}Key`, paramValue);
  }

  /**
   * Returns all search filters as a string. Joined by a comma.
   */
  function getCurrentFilterString(){
    return `Name: ${nameFilter}, Min Buy: ${minBuyFilter}, Max Buy: ${maxBuyFilter}, Min Flips: ${minFlipsFilter}, Max Flips: ${maxFlipsFilter}, Min Traders: ${minTradersFilter}, Max Traders: ${maxTradersFilter}`;
  }

  /**
   * Returns the nabbot image url of the item.
   * @param itemName The item name to return the image url for.
   */
  function nameToImage(itemName: string): string{
    return `https://static.nabbot.xyz/tibiawiki/item/${itemName}.gif`
  }

  function nameToWikiLink(itemName: string){
    return <a href={'https://tibia.fandom.com/wiki/' + itemName} target='_blank'>{itemName}</a>
  }

  function doesDataMatchFilter(dataObject: ItemData){
    // Filter input by user.
    if(nameFilter != "" && !dataObject.name.toLowerCase().includes(nameFilter.toLowerCase())){
      return false;
    } 

    if(maxBuyFilter > 0 && dataObject.buyPrice.value > maxBuyFilter){
      return false;
    }

    if(minBuyFilter > -1 && dataObject.buyPrice.value < minBuyFilter){
      return false;
    }

    if(Math.min(dataObject.soldAmountMonth.value, dataObject.boughtAmountMonth.value) < minFlipsFilter){
      return false;
    }

    if(maxFlipsFilter > 0 && Math.min(dataObject.soldAmountMonth.value, dataObject.boughtAmountMonth.value) > maxFlipsFilter){
      return false;
    }

    if(maxTradersFilter > 0 && dataObject.activeTraders.value > maxTradersFilter){
      return false;
    }

    if(dataObject.activeTraders.value < minTradersFilter){
      return false;
    }

    return true;
  }

  function addDataRow(data: any){
    var metaData = itemMetaData[data.id];

    // Some data is not up to date. If it is old, add the missing values as -1.
    if(!("lowest_sell" in data)){
      data.lowest_sell = -1;
      data.lowest_buy = -1;
      data.highest_sell = -1;
      data.highest_buy = -1;
      data.sell_offers = -1;
      data.buy_offers = -1;
    }
    if (!("day_sell_offer" in data)){
      data.day_sell_offer = -1;
      data.day_buy_offer = -1;
      data.day_sold = -1;
      data.day_bought = -1;
      data.day_highest_sell = -1;
      data.day_lowest_sell = -1;
      data.day_highest_buy = -1;
      data.day_lowest_buy = -1;
    }
    if(!("total_immediate_profit" in data)){
      data.total_immediate_profit = -1;
    }

    // Get the item name from the wiki, or the name from the bin if the wiki name is not set.
    var itemName = metaData.wiki_name;
    if(itemName == null || itemName == "") {
      itemName = metaData.name;
    }

    var dataObject: ItemData = new ItemData(data.id, itemName, metaData.category, data.sell_offer, data.buy_offer, 
      data.month_sell_offer, data.month_buy_offer, data.lowest_sell, data.lowest_buy, data.highest_sell, data.highest_buy, data.sold, data.bought, 
      data.day_sell_offer, data.day_buy_offer, data.day_lowest_sell, data.day_lowest_buy, data.day_highest_sell, data.day_highest_buy, data.day_sold, data.day_bought,
      data.sell_offers, data.buy_offers, data.active_traders, metaData.npc_sell, metaData.npc_buy, data.total_immediate_profit, "total_immediate_profit_info" in data ? data.total_immediate_profit_info : "");

    if(!doesDataMatchFilter(dataObject)){
      return;
    }

    dataSource.push(dataObject);
  }

  function setDataColumns(exampleItem: ItemData){
    columns = [];

    // Add name column.
    columns.push({
      title: 'Name',
      dataIndex: 'name',
      width: 100,
      fixed: 'left',
      sorter: (a: any, b: any) => a.name.localeCompare(b.name),
      sortDirections: ['descend', 'ascend', 'descend'],
      render: (text: any, record: any) => {
        return <div>
          <img src={nameToImage(text)}/> <br></br>
          {nameToWikiLink(text)}
          </div>;
      }
    });
    
    // Add all other columns.
    for (const [key, value] of Object.entries(exampleItem)) {
      if(key == "name" || value.isHidden || !marketColumns.includes(key))
        continue;

      columns.push({
        title: value.name,
        dataIndex: [key, 'localisedValue'],
        width: 50,
        sorter: (a: any, b: any) => {
          if (typeof a[key].value == "number")
            return a[key].value - b[key].value;
          else
            return a[key].value.localeCompare(b[key].value);
        },
        sortDirections: ['descend', 'ascend', 'descend'],
        render: (text: any, record: any) => {
          return value.additionalInfo.length > 0 ? 
          <div><AntTooltip style={{ marginLeft: '200px' }} title={value.additionalInfo}>{text}</AntTooltip></div> : 
          <div>{text}</div>
        }
      });
    }

    setColumns([...columns]);
  }

  async function fetchData(){
    if (isLoading)
      return;

    setIsLoading(true);
    setLastUpdated(0);

    await fetchWorldData();

    // Load metadata if it isn't already loaded.
    if(Object.keys(itemMetaData).length == 0)
      await fetchMetaDataAsync();

    // Load events if not already loaded.
    if(Object.keys(events).length == 0)
      await fetchEventHistory();

    // Check if marketServer is in cachedMarketResponse.
    if (!(marketServer in cachedMarketResponses) || cachedMarketResponses[marketServer].timestamp < new Date(worldDataDict[marketServer].last_update + "Z").getTime()){
      var items = await getDataAsync(`market_values?limit=4000&server=${marketServer}`);
      cachedMarketResponses[marketServer] = {"timestamp": new Date().getTime(), "response": items};
    }

    var marketValues = JSON.parse(cachedMarketResponses[marketServer].response);

    var data = marketValues.values;
    dataSource = [];

    for(var i = 0; i < data.length; i++){
      addDataRow(data[i]);
    }

    setDataColumns(exampleItem);
    setDataSource([...dataSource]);

    // If data has values, set the last updated timestamp to the maximum timestamp of the data.
    if(data.length > 0){
      setLastUpdated(Math.max(...data.map((x: any) => x.time)));
    }

    setIsLoading(false);
    setIsDrawerOpen(false);
  }

  /**
   * Fetches all tracked item names from tracked_items.txt, and maps their lowercase version to original version
   * in the itemNames dictionary.
   */
  async function fetchMetaDataAsync(){
    var items = await getDataAsync("item_metadata");
    var metaDatas: [ItemMetaData] = JSON.parse(items).metadata;

    for(var item of metaDatas){
      itemMetaData[item.id] = item;
    }
  }

  /// Gets and parses the events.csv file from the data branch, and saves the events in the global events dictionary.
  async function fetchEventHistory(){
    var eventResponse = await getDataAsync("events");

    var eventValues = JSON.parse(eventResponse);
    var eventEntries = eventValues.events;

    for(var i = 0; i < eventEntries.length; i++){
      var date = eventEntries[i].date;
      var eventNames = eventEntries[i].events;
      events[date] = eventNames;
    }
  }

  async function fetchWorldData(){
    var items = await getDataAsync("world_data");
    worldData = JSON.parse(items).worlds;
    worldDataDict = {};
    for(var i = 0; i < worldData.length; i++){
      worldDataDict[worldData[i].name] = worldData[i];
    }

    setMarketServerOptions(worldData.map(x => {return {label: `${x.name} (${unixTimeToTimeAgo(new Date(x.last_update + "Z").getTime())})`, value: x.name}}));
  }

  async function fetchPriceHistory(itemId: number){
    setIsLoading(true);

    var item = await getDataAsync(`item_history?server=${marketServer}&item_id=${itemId}`);

    var priceGraphData: CustomTimeGraph = new CustomTimeGraph();
    priceGraphData.addDetail("buyOffer", "#8884d8", "Buy offer");
    priceGraphData.addDetail("sellOffer", "#82ca9d", "Sell offer");

    var priceTransactionGraphData: CustomTimeGraph = new CustomTimeGraph();
    priceTransactionGraphData.addDetail("bought", "#8884d8", "Bought");
    priceTransactionGraphData.addDetail("sold", "#82ca9d", "Sold");

    var traderGraphData: CustomTimeGraph = new CustomTimeGraph();
    traderGraphData.addDetail("activeTraders", "#d884d8", "Active traders");

    var weekdayPriceGraph: CustomTimeGraph = new CustomTimeGraph();
    weekdayPriceGraph.addDetail("buyOffer", "#8884d8", "Mean buy offer");
    weekdayPriceGraph.addDetail("sellOffer", "#82ca9d", "Mean sell offer");
    weekdayPriceGraph.isWeekdayGraph = true;

    var weekdayTransactionGraph: CustomTimeGraph = new CustomTimeGraph();
    weekdayTransactionGraph.addDetail("dayBought", "#8884d8", "Mean bought");
    weekdayTransactionGraph.addDetail("daySold", "#82ca9d", "Mean sold");
    weekdayTransactionGraph.isWeekdayGraph = true;

    var itemValues = JSON.parse(item);
    console.log(itemValues);

    var data = itemValues.history;
    for(var i = 0; i < data.length; i++){
      var data_events: string[] = timestampToEvents(data[i].time, events);

      var priceDatapoint = new CustomHistoryData(data[i].time, data_events);
      priceDatapoint.addData("buyOffer", data[i].buy_offer ?? 0);
      priceDatapoint.addData("sellOffer", data[i].sell_offer ?? 0);
      priceGraphData.addData(priceDatapoint);

      var transactionDatapoint = new CustomHistoryData(data[i].time, data_events);
      transactionDatapoint.addData("bought", data[i].bought ?? 0);
      transactionDatapoint.addData("sold", data[i].sold ?? 0);
      priceTransactionGraphData.addData(transactionDatapoint);

      var traderDatapoint = new CustomHistoryData(data[i].time, data_events);
      traderDatapoint.addData("activeTraders", data[i].active_traders ?? 0);
      traderGraphData.addData(traderDatapoint);

      var medianWeekdayPriceDatapoint = new CustomHistoryData(data[i].time, data_events);
      medianWeekdayPriceDatapoint.addData("buyOffer", data[i].buy_offer ?? 0);
      medianWeekdayPriceDatapoint.addData("sellOffer", data[i].sell_offer ?? 0);
      weekdayPriceGraph.addData(medianWeekdayPriceDatapoint);

      var medianWeekdayTransactionDatapoint = new CustomHistoryData(data[i].time, data_events);
      medianWeekdayTransactionDatapoint.addData("dayBought", data[i].day_bought);
      medianWeekdayTransactionDatapoint.addData("daySold", data[i].day_sold);
      weekdayTransactionGraph.addData(medianWeekdayTransactionDatapoint);
    }

    priceGraphData.calculateTrend();
    priceTransactionGraphData.calculateTrend();

    setModalPriceHistory(priceGraphData);
    setModalTraderHistory(traderGraphData);
    setModalTransactionHistory(priceTransactionGraphData);
    setModalMedianWeekdayPriceHistory(weekdayPriceGraph);
    setModalMedianTransactionVolumeHistory(weekdayTransactionGraph);

    setIsLoading(false);
  }

  const [messageApi, contextHolder] = message.useMessage(); 
  const { defaultAlgorithm, darkAlgorithm } = theme;
  var [isLightMode, setIsLightMode] = useState(getLocalParamValue("isLightMode", "false") != "false");
  useEffect(() => {
    setLocalParamValue("isLightMode", isLightMode.toString(), false);
  }, [isLightMode]);

  var [marketServer, setMarketServer] = useState(getLocalParamValue("marketServer", "Antica"));
  useEffect(() => {
    setLocalParamValue("marketServer", marketServer, false);
  }, [marketServer]);

  var [marketColumns, setMarketColumns] = useState(JSON.parse(getLocalParamValue("selectedMarketColumns", JSON.stringify(["sellPrice", "buyPrice"]))));
  useEffect(() => {
    setLocalParamValue("selectedMarketColumns", JSON.stringify(marketColumns), true);
    setDataColumns(exampleItem);
  }, [marketColumns]);

  var [apiKey, setApiKey] = useState(getLocalParamValue("accessToken", ""));
  useEffect(() => {
    setLocalParamValue("accessToken", apiKey, true);
  }, [apiKey]);
  
  var [marketServerOptions, setMarketServerOptions] = useState<SelectProps[]>();

  // Make all columns optional.
  var marketColumnOptions: any[] = [];
  for (const [key, value] of Object.entries(exampleItem)) {
    if(key == "name")
      continue;

    var category = marketColumnOptions.find(x => x.label == value.category);

    // Add the value.category to the column options if it doesn't exist yet.
    if(category == null){
      category = {label: value.category, options: []};
      marketColumnOptions.push(category);
    }

    category.options.push({
      value: key,
      label: <div>{value.name} <AntTooltip title={value.description}><QuestionCircleOutlined /></AntTooltip></div>,
    });
  }

  var [dataSource, setDataSource] = useState<ItemData[]>([]);
  var [isLoading, setIsLoading] = useState(false);
  var [columns, setColumns] = useState<ColumnType<ItemData>[]>([]);
  var [nameFilter, setNameFilter] = useState("");
  var [minBuyFilter, setMinBuyFilter] = useState(-1);
  var [maxBuyFilter, setMaxBuyFilter] = useState(0);
  var [minFlipsFilter, setMinTradesFilter] = useState(-1);
  var [maxFlipsFilter, setMaxTradesFilter] = useState(0);
  var [minTradersFilter, setMinOffersFilter] = useState(-1);
  var [maxTradersFilter, setMaxOffersFilter] = useState(0);
  var [selectedItem, setSelectedItem] = useState("");
  var [modalPriceHistory, setModalPriceHistory] = useState<CustomTimeGraph>();
  var [modalTraderHistory, setModalTraderHistory] = useState<CustomTimeGraph>();
  var [modalTransationHistory, setModalTransactionHistory] = useState<CustomTimeGraph>();
  var [modalMedianWeekdayPriceHistory, setModalMedianWeekdayPriceHistory] = useState<CustomTimeGraph>();
  var [modalMedianTransactionVolumeHistory, setModalMedianTransactionVolumeHistory] = useState<CustomTimeGraph>();
  var [isModalOpen, setIsModalOpen] = useState(false);
  var [passwordVisible, setPasswordVisible] = useState(false);
  var [lastUpdated, setLastUpdated] = useState(0);
  var [isDrawerOpen, setIsDrawerOpen] = useState(true);

  var weekdayDateOptions: Intl.DateTimeFormatOptions = {hour12: true, weekday: "short", year: "numeric", month: "short", day: "numeric", hour: '2-digit', minute:'2-digit'};
  var dateOptions: Intl.DateTimeFormatOptions = {hour12: true, year: "numeric", month: "short", day: "numeric"}
  
  useEffect(() => {
    const yourFunction = async () => {
      await fetchWorldData();
    };
    yourFunction();
  }, []);

  return (
  <ConfigProvider
    theme={{
      algorithm: isLightMode ? defaultAlgorithm : darkAlgorithm,
  }}>
    {contextHolder}
    <Layout hasSider style={{height:'100vh'}}>
    <FloatButton 
        tooltip={isLightMode ? <div>Switch to dark mode</div> : <div>Switch to light mode</div>} 
        icon={<BulbOutlined />} 
        onClick={() => setIsLightMode(!isLightMode)}
        style={{ position: 'fixed', top: '2%', right: '2%' }}
      />
      <Drawer
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        placement='left'
        closable={false}
        style={{
          overflow: 'auto',
          padding: 10,
          borderRight: isLightMode ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div id='title' style={{borderBottom: isLightMode ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)'}}>
          <Title level={4} style={{textAlign:'center'}}>
            Market Tracker
          </Title>
        </div>
        <Title level={5} style={{textAlign:'center', color:'grey'}}>
          Filters
        </Title>
        
        <Form layout='vertical'>
          <Form.Item>
            <Select options={marketServerOptions} defaultValue={marketServer} onChange={(value) => setMarketServer(value)}></Select>
          </Form.Item>
          <Form.Item>
            <Input placeholder='Name' onChange={(e) => setNameFilter(e.target.value)}></Input>
          </Form.Item>
          <Form.Item>
            <InputNumber placeholder='Minimum buy price' onChange={(e) => setMinBuyFilter(e == null ? 0 : +e)} formatter={(value) => value ? (+value).toLocaleString() : ""}></InputNumber>
            <InputNumber placeholder='Maximum buy price' onChange={(e) => setMaxBuyFilter(e == null ? 0 : +e)} formatter={(value) => value ? (+value).toLocaleString() : ""}></InputNumber>
          </Form.Item>
          <Form.Item>
            <InputNumber placeholder='Minimum flips' onChange={(e) => setMinTradesFilter(e == null ? 0 : +e)} formatter={(value) => value ? (+value).toLocaleString() : ""}></InputNumber>
            <InputNumber placeholder='Maximum flips' onChange={(e) => setMaxTradesFilter(e == null ? 0 : +e)} formatter={(value) => value ? (+value).toLocaleString() : ""}></InputNumber>
          </Form.Item>
          <Form.Item>
            <InputNumber placeholder='Minimum traders' onChange={(e) => setMinOffersFilter(e == null ? 0 : +e)} formatter={(value) => value ? (+value).toLocaleString() : ""}></InputNumber>
            <InputNumber placeholder='Maximum traders' onChange={(e) => setMaxOffersFilter(e == null ? 0 : +e)} formatter={(value) => value ? (+value).toLocaleString() : ""}></InputNumber>
          </Form.Item>
          <Form.Item>
            <Input.Password placeholder="Access token" defaultValue={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </Form.Item>
          <Form.Item>
            <Button htmlType="submit" id='search-button' onClick={fetchData} loading={isLoading}>
              Search
            </Button>
          </Form.Item>
        </Form>
      </Drawer>
      <Layout className="site-layout" style={{ width: '100%' }}>
        <Content style={{ margin: '24px 16px 0', overflow: 'auto' }}>
          <Modal
            title=<div>Item history for {nameToWikiLink(selectedItem)}</div>
            centered
            open={isModalOpen}
            onOk={() => setIsModalOpen(false)}
            onCancel={() => setIsModalOpen(false)}
            style={{ minWidth: '80vw' }}
          >
            <Collapse defaultActiveKey={1}>
            <Panel header="Price over time" key="1">
              <DynamicChart timeGraph={modalPriceHistory!} isLightMode={isLightMode}></DynamicChart>
            </Panel>
            <Panel header="Transactions over time" key="2">
            <Alert message="These are the cummulative amount of bought and sold items within a 1 month window." showIcon type="info" closable />
              <DynamicChart timeGraph={modalTransationHistory!} isLightMode={isLightMode}></DynamicChart>
            </Panel>
            <Panel header="Median price per weekday" key="3">
              <DynamicChart timeGraph={modalMedianWeekdayPriceHistory!} isLightMode={isLightMode}></DynamicChart>
            </Panel>
            <Panel header="Median transactions per weekday" key="4">
              <DynamicChart timeGraph={modalMedianTransactionVolumeHistory!} isLightMode={isLightMode}></DynamicChart>
            </Panel>
            </Collapse>
          </Modal>
          
          <Button icon={<FilterOutlined />} style={{ marginBottom: '1%' }} onClick={() => setIsDrawerOpen(true)}>
            Open search menu
          </Button>

          <Alert message="You can see the price history of an item by clicking on its row!" showIcon type="info" closable />
          <Alert message="You can select more data to view by clicking on the box below! ⬇" showIcon type="info" closable />
          
          <Select
            mode="multiple"
            allowClear
            style={{ width: '100%' }}
            placeholder="Select the table columns you want to see"
            defaultValue={marketColumns}
            onChange={setMarketColumns}
            options={marketColumnOptions}
          />
          <Table id='items-table' dataSource={dataSource} columns={columns} loading={isLoading} onRow={(record, rowIndex) => {
              return {
                onClick: async (event) => {setSelectedItem(record.name); await fetchPriceHistory(record.id.value); setIsModalOpen(true);}
              };
            }} onChange={handleTableChanged}>
        </Table>
        </Content>
        
        <Footer style={{
          borderTop: isLightMode ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
          
          textAlign: 'center',
        }}>
          ❤️ Please consider donating a few TC or gold to <a href="https://www.tibia.com/community/?name=leenia">Leenia</a> on Antica to help out! ❤️ <br></br>
          For support, questions or feature requests, please join the <a href="https://discord.gg/Rvc8mXtmZH">Discord server</a>.
        </Footer>
      </Layout>
    </Layout>
  </ConfigProvider>
  );
};

export default App;
