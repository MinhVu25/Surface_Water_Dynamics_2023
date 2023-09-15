/* +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 * +++++                         Water Occurence Map                        ++++++
 * +++++   Author: Vu Anh Minh, TH Köln – University of Applied Sciences    ++++++
 * +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 */
//////////////// Part 1: Surface water extraction 
// Draw geometry, or import shapefile with the region of interest 
var geometry = ee.FeatureCollection("users/MinhVu/LV_NhatLe_polygon");
var ROI = geometry;
Map.addLayer(ROI, {}, 'ROI',0);
Map.centerObject(ROI, 9);
          
//Load Sentinel-1 SAR collection and filter according to data collection type
var S1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(ROI)
  .filterDate('2016-01-01','2022-12-31')
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filterMetadata('platform_number',"equals",'A');

//Add first image to map to get an idea of what a SAR image looks like  
Map.addLayer(S1.first(),{bands: 'VH',min: -18, max: 0}, 'SAR image',0);
  
// Filter speckle noise
var filterSpeckles = function(img) {
  var vh = img.select('VH'); //select the VH polarization band
  var vh_smoothed = vh.focal_median(50,'circle','meters').rename('VH_Filtered').clip(ROI); //Apply a focal median filter
  return img.addBands(vh_smoothed); // Add filtered VH band to original image
};

// Map speckle noise filter across collection. Result is same collection, with smoothed VH band added to each image
S1 = S1.map(filterSpeckles);

// Add speckle filtered image to map to compare with raw SAR image
Map.addLayer(S1.first(),{bands: 'VH_Filtered',min: -18, max: 0}, 'Filtered SAR image',0);

// Classify water pixels using the optimal threshhold 
// Here we are using -19.
var classifyWater = function(img) {
  var vh = img.select('VH_Filtered');
  var water = vh.lt(-19).rename('Water');  //Identify all pixels below threshold and set them equal to 1. All other pixels set to 0
  water = water.updateMask(water).unmask(0); 
  var DEM = ee.Image('WWF/HydroSHEDS/30CONDEM');
  var terrain = ee.Algorithms.Terrain(DEM);
  var slope = terrain.select('slope');
  water = water.updateMask(slope.lt(5)).unmask(0);
  return img.addBands(water);  //Return image with added classified water-land (1-0) band
};

// Map classification across sentinel-1 collection and print to console to inspect
S1 = S1.map(classifyWater);

//////////////// Part 2: Surface water area calculation of all image collection
// To avoid computational time out, you can alternatively lock Part 2 or Part 3 as these 2 parts function independently 
// Select Water band and remove 0 value as land from image collection
var S1_water = S1.map(function (img) {
    return img.updateMask((img.select('Water').updateMask(1))).select('Water');
});
// Develop function to calculate surface water area for the whole collection
function addArea(img) {
  var area = ee.Image.pixelArea().divide(1e6)
    .updateMask(img.mask()) // Don't include area of masked pixels
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: ROI,
      scale: 10,
      bestEffort: true
    });
  return ee.Image([]).addBands(img).set(area);   
}
var area_collection = S1_water.map(addArea);
// Extract list of sensing time of images
var list1 = S1
    .map(function(image) {
      return ee.Feature(null, {'date': image.date().format('YYYY-MM-dd HH:mm:ss')});
    })
    .distinct('date')
    .aggregate_array('date');
// Extract list of value of surface water area for all images
var list2 = area_collection.aggregate_array('area').getInfo()
// Combine two lists to see surface water area with coressponding date
var area_statistic = list1.zip(list2)
print(area_statistic);
//////////////// Part 3: Develop Water Occurence Map
// To avoid computational time out, you can alternatively lock Part 2 or Part 3 as these 2 parts function independently 
// Sort image collection by months
var months = ee.List.sequence(1, 12);

// Group by month, and then reduce within groups by mean();
// the result is an ImageCollection with one image for each month.
var byMonth = ee.ImageCollection.fromImages(
      months.map(function (m) {
        return S1.filter(ee.Filter.calendarRange(m, m, 'month'))
                    .select(4).mean()
                    .set('month', m);
}));

//Calculating water occurrence
var min_occurence = 0;
var water_frequency = byMonth.mean().multiply(100);
var water_frequency_masked = water_frequency.updateMask(water_frequency.gte(min_occurence)).clip(ROI);

// Export water occurrence map to Google Drive
// Then reclasify into 5 discrete layers in GIS softwares e.g. ArcGIS
Export.image.toDrive({image:water_frequency_masked,
                    region:ROI,
                    description: 'Water_Occurence',
                    folder: 'Water_Occurence',
                    maxPixels: 1e13,
                    scale:10});

//Add color bar
//base code adapted from: 
//https://gis.stackexchange.com/questions/290713/adding-map-key-to-map-or-console-in-google-earth-engine
//https://code.earthengine.google.com/9f890c110e98fa3391480543009c8028

function ColorBar(palette) {
  return ui.Thumbnail({
    image: ee.Image.pixelLonLat().select(0),
    params: {
      bbox: [0, 0, 1, 0.1],
      dimensions: '300x15',
      format: 'png',
      min: 0,
      max: 1,
      palette: palette,
    },
    style: {stretch: 'horizontal', margin: '0px 22px'},
  });
}
function makeLegend(lowLine, midLine, highLine,lowText, midText, highText, palette) {
  var  labelheader = ui.Label('Water occurrence during investigation period',{margin: '5px 17px', textAlign: 'center', stretch: 'horizontal', fontWeight: 'bold'});
  var labelLines = ui.Panel(
      [
        ui.Label(lowLine, {margin: '-4px 21px'}),
        ui.Label(midLine, {margin: '-4px 0px', textAlign: 'center', stretch: 'horizontal'}),
        ui.Label(highLine, {margin: '-4px 21px'})
      ],
      ui.Panel.Layout.flow('horizontal'));
      var labelPanel = ui.Panel(
      [
        ui.Label(lowText, {margin: '0px 14.5px'}),
        ui.Label(midText, {margin: '0px 0px', textAlign: 'center', stretch: 'horizontal'}),
        ui.Label(highText, {margin: '0px 1px'})
      ],
      ui.Panel.Layout.flow('horizontal'));
    return ui.Panel({
      widgets: [labelheader, ColorBar(palette), labelLines, labelPanel], 
      style: {position:'bottom-left'}});
}
Map.add(makeLegend('|', '|', '|', "0 %", '50 %', '100%', ['orange','yellow','lightblue','darkblue']));

//Add layers animation to map
Map.addLayer(S1.median(),{bands: ['VH','VH','VH'],min: -20,max: 0,},'S1-image [median]',0);
Map.addLayer(water_frequency_masked,{min:min_occurence,max:100,palette:['orange','yellow','lightblue','darkblue']},'Percentage of annual water occurence');
