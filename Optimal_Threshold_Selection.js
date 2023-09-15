/* +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 * +++++                     Optimal threshold selection                    ++++++
 * +++++   Author: Vu Anh Minh, TH Köln – University of Applied Sciences    ++++++
 * +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 */
//////////////// Part 1: Prepare ROI and Reference data
// Draw geometry, or import shapefile with the region of interest
var geometry = ee.FeatureCollection("users/MinhVu/LV_NhatLe2"),
    Water = ee.FeatureCollection("users/MinhVu/Vetlu2020_VAWR_new"),
    Flood = ee.FeatureCollection("users/MinhVu/Bienlu2020_VAWR"),
    NonFlood = ee.FeatureCollection("users/MinhVu/Frame_Bienlu");
var ROI = geometry;
Map.addLayer(ROI, {}, 'ROI',false);
Map.centerObject(ROI, 10);

//Import reference data
var water = ee.FeatureCollection(Water);
var flood = ee.FeatureCollection(Flood);
var nonflood = ee.FeatureCollection(NonFlood);

// Overwrite the old properties with a new dictionary.
var water = water.set('Landcover', 1);
var flood = flood.set('Landcover', 1);
var nonflood = nonflood.set('Landcover', 0);
Map.addLayer(water, {}, 'ref',false);

// Merge validation layers
var newfc = water; //Flood traces
// print(newfc);
var newfc2 = flood.merge(nonflood); // Flood boundary
// print(newfc2);

//////////////// Part 2: Flood extent extraction
// Input threshold for water extraction. Try all threshold value within threshold range to find the optimal one
var sen1_param = -19;

// Select flood image on 18th October 2020
var img = ee.Image('COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20201018T110507_20201018T110532_034850_041018_4BC9').select('VH');
var img_smoothed = img.focal_median(50,'circle','meters').rename('VH_Filtered').clip(ROI); //Apply a focal median filter
var img = img.addBands(img_smoothed); // Add filtered VH band to original image
Map.addLayer(img,{bands: 'VH_Filtered',min: -18, max: 0}, 'After Filtered SAR image',0);
// Apply threshold to the image
var img_vh = img.select('VH_Filtered');
var img_water = img_vh.lt(sen1_param).rename('water');  //Identify all pixels below threshold and set them equal to 1. All other pixels set to 0
var img_mask = img_water.updateMask(img_water); //Remove all pixels equal to 0
var img = img.addBands(img_water);  //Return image with added classified water band
// print(img,'Flood image');
Map.addLayer(img_water,{pallete:['blue']},'Flood extent with permernant water',0);
// Refine flood result using additional datasets
      
      // Include JRC layer on surface water seasonality to mask flood pixels from areas
      // of "permanent" water (where there is water > 10 months of the year)
      var swater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('seasonality');
      var swater_mask = swater.gte(10).updateMask(swater.gte(10));
      
      //Flooded layer where perennial water bodies (water > 10 mo/yr) is assigned a 0 value
      var flooded_mask = img_water.where(swater_mask,0);
      Map.addLayer(swater_mask,{pallete:['red']},'permernant water',0);
      // final flooded area without pixels in perennial waterbodies
      var flooded = flooded_mask.updateMask(flooded_mask);
      
      // Compute connectivity of pixels to eliminate those connected to 8 or fewer neighbours
      // This operation reduces noise of the flood extent product 
      var connections = flooded.connectedPixelCount();    
      var flooded = flooded.updateMask(connections.gte(8));
      
      // Mask out areas with more than 5 percent slope using a Digital Elevation Model 
      var DEM = ee.Image('WWF/HydroSHEDS/03VFDEM');
      var terrain = ee.Algorithms.Terrain(DEM);
      var slope = terrain.select('slope');
      var flooded = flooded.updateMask(slope.lt(5));
// Draw final flood extent by clipping with frame of reference data. 
// This is to ensure the extracted flood extent and reference data are in the same coordinate frame extent.
var flooded_unmask = flooded.unmask(0).clip(newfc2);
Map.addLayer(flooded_unmask,{
      min: 0,
      max: 1,
      palette: ['#FFFFFF','#0000FF']
    },'Flood extent',1);

// Calculate flood extent area
// Create a raster layer containing the area information of each pixel 
var flood_pixelarea = flooded.select('water')
  .multiply(ee.Image.pixelArea());
  
// Sum the areas of flooded pixels
// default is set to 'bestEffort: true' in order to reduce compuation time, for a more 
// accurate result set bestEffort to false and increase 'maxPixels'. 
var flood_stats = flood_pixelarea.divide(10000).reduceRegion({
  reducer: ee.Reducer.sum(),              
  geometry: ROI,
  scale: 10, // native resolution 
  //maxPixels: 1e9,
  bestEffort: true
  });
print(flood_stats,'Flood area in hectar');

//////////////// Part 3: Accuracy assessment of extracted flood extent
// Validate flood traces
var validate = flooded_unmask.sampleRegions({
  collection: newfc,
  properties: ['Landcover'],
  scale: 10,
  tileScale: 4,
  geometries: true
}).randomColumn();
print(validate);

// Calculate Overall Accuracy and Kappa coefficient
var OverallAccuracy = validate.errorMatrix('Landcover', 'water');
// Printing of confusion matrix may time out. Alternatively, you can export it as CSV
print('Confusion Matrix', OverallAccuracy);
print('Overall Accuracy', OverallAccuracy.accuracy());
var Kappa = OverallAccuracy.kappa();
print('Kappa', Kappa);

// Show valid points
Map.addLayer(validate.draw({color: 'ff0000', pointRadius: 5}), {},"Points",0);
// Export flooded area as shapefile (for further analysis in e.g. QGIS)
// Convert flood raster to polygons
var flooded_vec = flooded.reduceToVectors({
  scale: 10,
  geometryType:'polygon',
  geometry: ROI,
  eightConnected: false,
  bestEffort:true,
  tileScale:2,
});

// Export flood polygons as shape-file
Export.table.toDrive({
  collection:flooded_vec,
  description:'Flood_extent_vector',
  fileFormat:'SHP',
  fileNamePrefix:'flooded_vec'
});
// Validate flood boundary
var validate2 = flooded_unmask.sampleRegions({
  collection: newfc2,
  properties: ['Landcover'],
  scale: 100,
  tileScale: 4,
  geometries: true
}).randomColumn();
//print(validate2);

// Calculate Overall Accuracy and Kappa coefficient
var OverallAccuracy2 = validate2.errorMatrix('Landcover', 'water');
// Printing of confusion matrix may time out. Alternatively, you can export it as CSV
print('Confusion Matrix2', OverallAccuracy2);
print('Overall Accuracy2', OverallAccuracy2.accuracy());
var Kappa2 = OverallAccuracy2.kappa();
print('Kappa2', Kappa2);